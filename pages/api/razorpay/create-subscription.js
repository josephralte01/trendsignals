import razorpayInstance from '../../../lib/razorpay';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../app/api/auth/[...nextauth]"; // Corrected path

const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user || !session.user.email) {
    return res.status(401).json({ error: 'Unauthorized. User session not found or email is missing.' });
  }

  const userId = session.user.id; // Assuming 'id' is available on session.user from your NextAuth config
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. User ID not found in session.' });
  }

  try {
    const { plan_id, total_count = 12 } = req.body; // total_count is for how many billing cycles

    if (!plan_id) {
      return res.status(400).json({ error: '`plan_id` is required.' });
    }

    // 1. Find user in our database
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // This case should ideally not happen if session.user.id is valid and from your DB
      return res.status(404).json({ error: 'User not found in database.' });
    }

    // 2. Check for or create Razorpay Customer ID
    let razorpayCustomerId = user.razorpayCustomerId;

    if (!razorpayCustomerId) {
      const customerDetails = {
        name: user.name || session.user.name || 'N/A', // Use user.name from DB first
        email: user.email, // user.email should be reliable
        contact: '', // Optional: Add contact number if available and required
        notes: {
          internal_user_id: userId,
        },
      };
      const razorpayCustomer = await razorpayInstance.customers.create(customerDetails);
      razorpayCustomerId = razorpayCustomer.id;

      // Save the new razorpayCustomerId to our user record
      user = await prisma.user.update({
        where: { id: userId },
        data: { razorpayCustomerId: razorpayCustomerId },
      });
    }

    // 3. Create Razorpay Subscription
    const subscriptionOptions = {
      plan_id: plan_id,
      customer_id: razorpayCustomerId, // Required if customer_notify is 0
      total_count: total_count, // Number of billing cycles (e.g., 12 for 1 year of monthly payments)
      quantity: 1, // Default to 1, can be made configurable
      customer_notify: 1, // Send notifications to customer (0 or 1)
      // start_at: Math.floor(Date.now() / 1000) + 300, // Optional: Unix timestamp for when subscription should start (e.g., 5 mins from now)
      notes: {
        internal_user_id: userId,
        plan_selected: plan_id,
      },
    };

    const subscription = await razorpayInstance.subscriptions.create(subscriptionOptions);

    if (!subscription) {
      return res.status(500).json({ error: 'Razorpay subscription creation failed.' });
    }

    console.log('Razorpay Subscription Created:', subscription);

    // It's good practice to also create a preliminary record in your DB for this subscription
    // This can be updated by webhooks later for status changes.
    // For now, we'll rely on webhooks to create/update the Subscription record.
    // If you want to create it here, ensure you handle potential race conditions with webhooks.

    return res.status(200).json({
      subscriptionId: subscription.id,
      razorpayCustomerId: razorpayCustomerId,
      keyId: process.env.RAZORPAY_KEY_ID, // For Razorpay Checkout
      planId: plan_id,
      status: subscription.status, // e.g. "created"
    });

  } catch (error) {
    console.error('Error creating Razorpay subscription:', error);
    // Check if it's a Razorpay specific error
    if (error.statusCode && error.error && error.error.description) {
      return res.status(error.statusCode).json({
        error: error.error.description,
        field: error.error.field,
        reason: error.error.reason,
        step: error.error.step,
        source: error.error.source,
      });
    }
    // Generic error
    return res.status(500).json({ error: 'Internal Server Error while creating subscription.' });
  } finally {
    await prisma.$disconnect();
  }
}
