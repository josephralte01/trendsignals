import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
// import razorpayInstance from '../../../lib/razorpay'; // Not strictly needed for verification if done manually

const prisma = new PrismaClient();
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!KEY_SECRET) {
  console.warn('RAZORPAY_KEY_SECRET is not set. Payment verification will fail.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!KEY_SECRET) {
    console.error('Payment verification failed: Razorpay Key Secret is not configured.');
    return res.status(500).json({ error: 'Server configuration error for payment verification.' });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification details.' });
  }

  try {
    const bodyToVerify = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(bodyToVerify.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Signature is authentic. Now, you might want to double-check with Razorpay API or your DB.
      // For this example, we'll consider authentic signature as verified for the client.
      // The webhook 'payment.captured' is the more robust way to confirm payment and update DB.

      // Optional: Update local payment record if it exists, marking it as client-verified
      // This is often redundant if webhooks are working correctly but can provide faster UI feedback.
      try {
        const payment = await prisma.payment.findUnique({
          where: { razorpayPaymentId: razorpay_payment_id },
        });

        if (payment) {
          // If payment exists and is, for example, in 'created' or 'authorized' state,
          // you might update it. However, 'captured' state should be set by webhook.
          // For now, we just log.
          console.log(`Payment ${razorpay_payment_id} client-side verification successful. Current DB status: ${payment.status}`);
        } else {
          // This could happen if the webhook hasn't processed yet or if it's a new payment.
          // The 'payment.captured' webhook should create the definitive record.
          console.log(`Payment ${razorpay_payment_id} client-side verification successful. No existing DB record found by this endpoint (expected if webhook is primary).`);
        }
      } catch (dbError) {
        console.error("Error querying payment during verification (non-critical for verification logic itself):", dbError);
      }

      return res.status(200).json({ verified: true, message: 'Payment signature verified successfully.' });
    } else {
      return res.status(400).json({ verified: false, error: 'Invalid payment signature.' });
    }

  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    return res.status(500).json({ verified: false, error: 'Internal server error during payment verification.' });
  } finally {
    await prisma.$disconnect();
  }
}
