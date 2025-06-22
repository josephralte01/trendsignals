import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Ensure your RAZORPAY_WEBHOOK_SECRET is set in environment variables
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.warn('RAZORPAY_WEBHOOK_SECRET is not set. Webhook verification will fail.');
}

// Helper function to verify signature
const verifySignature = (body, signature, secret) => {
  if (!secret) return false; // Cannot verify without a secret
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(body)); // Razorpay expects stringified raw body
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
};


export const config = {
  api: {
    bodyParser: false, // Required for raw body parsing for signature verification
  },
};

// Helper to read raw body
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!WEBHOOK_SECRET) {
    console.error('Webhook processing failed: Webhook secret is not configured.');
    return res.status(500).json({ error: 'Webhook secret not configured on server.' });
  }

  const rawBodyBuffer = await getRawBody(req);
  const bodyString = rawBodyBuffer.toString();
  let body;
  try {
    body = JSON.parse(bodyString);
  } catch (e) {
    console.error('Webhook error: Invalid JSON payload', e);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    console.warn('Webhook received without signature.');
    return res.status(400).json({ error: 'Signature not found in headers.' });
  }

  // It's crucial to use the raw string body for verification, not the parsed JSON object
  const isValidSignature = verifySignature(body, signature, WEBHOOK_SECRET);


  if (!isValidSignature) {
    console.warn('Webhook received with invalid signature.');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  console.log(`Razorpay Webhook Received - Event: ${body.event}`, body.payload);

  try {
    const event = body.event;
    const payload = body.payload;

    switch (event) {
      case 'payment.captured': {
        const paymentEntity = payload.payment.entity;
        // This can be for a one-time payment or a subscription's first/recurring payment.
        // We need to identify the user and potentially the subscription.

        // Upsert payment record
        const paymentRecord = await prisma.payment.upsert({
          where: { razorpayPaymentId: paymentEntity.id },
          update: {
            status: paymentEntity.status, // should be 'captured'
            amount: paymentEntity.amount / 100, // Convert paise to currency unit
            currency: paymentEntity.currency,
            method: paymentEntity.method,
            razorpayOrderId: paymentEntity.order_id,
            notes: paymentEntity.notes,
            razorpaySignature: signature, // Store the signature for audit
          },
          create: {
            razorpayPaymentId: paymentEntity.id,
            userId: paymentEntity.notes?.internal_user_id || 'UNKNOWN_USER', // Fallback, ideally should always be present
            status: paymentEntity.status,
            amount: paymentEntity.amount / 100,
            currency: paymentEntity.currency,
            method: paymentEntity.method,
            razorpayOrderId: paymentEntity.order_id,
            isSubscriptionPayment: !!paymentEntity.subscription_id,
            subscriptionId: paymentEntity.subscription_id, // This is Razorpay's subscription_id
            notes: paymentEntity.notes,
            razorpaySignature: signature,
          },
        });
        console.log('Payment record updated/created:', paymentRecord.id);

        // If it's part of a subscription, the subscription events will handle its status.
        // If it's a one-time payment, this might be where you grant access to a product/service.
        if (!paymentEntity.subscription_id && paymentEntity.notes?.internal_user_id) {
          console.log(`One-time payment captured for user ${paymentEntity.notes.internal_user_id}. Grant access if applicable.`);
          // Example: await grantAccessToFeature(paymentEntity.notes.internal_user_id, paymentEntity.notes.item_id);
        }
        break;
      }

      case 'subscription.activated': {
        const subscriptionEntity = payload.subscription.entity;
        const customerId = subscriptionEntity.customer_id;

        // Find user by razorpayCustomerId
        const user = await prisma.user.findUnique({ where: { razorpayCustomerId: customerId } });
        if (!user) {
          console.error(`Webhook Error: User not found for Razorpay Customer ID ${customerId} on subscription.activated.`);
          // Potentially create a placeholder user or log an alert for manual intervention
          break;
        }

        // Upsert subscription record
        const dbSubscription = await prisma.subscription.upsert({
          where: { razorpaySubscriptionId: subscriptionEntity.id },
          update: {
            status: subscriptionEntity.status, // should be 'active'
            razorpayPlanId: subscriptionEntity.plan_id,
            currentPeriodEnd: new Date(subscriptionEntity.current_end * 1000), // Convert Unix timestamp to Date
            userId: user.id, // Ensure userId is set if creating
          },
          create: {
            userId: user.id,
            razorpaySubscriptionId: subscriptionEntity.id,
            razorpayPlanId: subscriptionEntity.plan_id,
            status: subscriptionEntity.status,
            currentPeriodEnd: new Date(subscriptionEntity.current_end * 1000),
          }
        });
        console.log(`Subscription ${dbSubscription.id} for user ${user.id} activated/updated.`);
        break;
      }

      case 'subscription.charged': {
        // This event occurs when a recurring payment for a subscription is successful.
        // The 'payment.captured' event for this charge would have already been processed.
        const subscriptionEntity = payload.subscription.entity;
        const paymentEntity = payload.payment.entity; // The payment that was just captured for this cycle

        const dbSubscription = await prisma.subscription.update({
          where: { razorpaySubscriptionId: subscriptionEntity.id },
          data: {
            status: subscriptionEntity.status, // Should remain 'active' or similar
            currentPeriodEnd: new Date(subscriptionEntity.current_end * 1000),
          },
        });
        console.log(`Subscription ${dbSubscription.id} charged successfully. New period end: ${dbSubscription.currentPeriodEnd}`);

        // Ensure a payment record exists for this charge (payment.captured might handle this too)
        // This is more of a cross-check or if you want specific logic for subscription payments here.
        await prisma.payment.upsert({
            where: { razorpayPaymentId: paymentEntity.id },
            update: { status: 'captured' }, // ensure status is captured
            create: {
                razorpayPaymentId: paymentEntity.id,
                userId: dbSubscription.userId,
                status: 'captured',
                amount: paymentEntity.amount / 100,
                currency: paymentEntity.currency,
                method: paymentEntity.method,
                razorpayOrderId: paymentEntity.order_id, // This will be null for subscription recurring charges
                isSubscriptionPayment: true,
                subscriptionId: subscriptionEntity.id, // Razorpay subscription_id
                notes: paymentEntity.notes,
            }
        });
        console.log(`Payment record for subscription charge ${paymentEntity.id} ensured.`);
        break;
      }

      case 'subscription.halted': {
        const subscriptionEntity = payload.subscription.entity;
        await prisma.subscription.update({
          where: { razorpaySubscriptionId: subscriptionEntity.id },
          data: {
            status: subscriptionEntity.status, // 'halted'
            // currentPeriodEnd might not change, or Razorpay might set it based on grace period
          },
        });
        console.log(`Subscription ${subscriptionEntity.id} halted.`);
        // Implement logic for dunning, notifying user, etc.
        break;
      }

      case 'subscription.cancelled': {
        const subscriptionEntity = payload.subscription.entity;
        await prisma.subscription.update({
          where: { razorpaySubscriptionId: subscriptionEntity.id },
          data: {
            status: subscriptionEntity.status, // 'cancelled'
            // currentPeriodEnd might remain, indicating when access expires
          },
        });
        console.log(`Subscription ${subscriptionEntity.id} cancelled.`);
        break;
      }

      case 'subscription.completed': {
        const subscriptionEntity = payload.subscription.entity;
        await prisma.subscription.update({
          where: { razorpaySubscriptionId: subscriptionEntity.id },
          data: {
            status: subscriptionEntity.status, // 'completed'
          },
        });
        console.log(`Subscription ${subscriptionEntity.id} completed its term.`);
        break;
      }

      // Add more cases as needed, e.g., refund.processed, order.paid etc.
      // case 'order.paid':
      //   const orderEntity = payload.order.entity;
      //   // Handle order paid event - often payment.captured is more direct for action
      //   break;

      default:
        console.log(`Unhandled Razorpay event: ${event}`);
    }

    return res.status(200).json({ received: true, message: 'Webhook processed successfully.' });

  } catch (error) {
    console.error('Error processing Razorpay webhook:', error);
    // Avoid sending detailed error messages back in response for security, log them instead.
    // If Prisma error or other specific error, you might want to customize this.
    if (error.code === 'P2025') { // Prisma specific: Record to update not found
        console.error('Webhook database error: Record not found for update.', error.meta);
         return res.status(404).json({ error: 'Related record not found for processing webhook.' });
    }
    return res.status(500).json({ error: 'Internal server error while processing webhook.' });
  } finally {
    await prisma.$disconnect();
  }
}
