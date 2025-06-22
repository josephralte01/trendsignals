import razorpayInstance from '../../../lib/razorpay';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../app/api/auth/[...nextauth]";

const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized. User session not found.' });
  }
  const userId = session.user.id;

  try {
    const { razorpay_subscription_id } = req.body;

    if (!razorpay_subscription_id) {
      return res.status(400).json({ error: '`razorpay_subscription_id` is required.' });
    }

    // Verify that this subscription belongs to the logged-in user
    const currentSubscription = await prisma.subscription.findFirst({
      where: {
        razorpaySubscriptionId: razorpay_subscription_id,
        userId: userId,
        // Optionally, ensure it's in a cancellable state, though Razorpay will also check this
        // status: { in: ['active', 'pending', 'halted'] }
      },
    });

    if (!currentSubscription) {
      return res.status(404).json({ error: 'Subscription not found or does not belong to the user.' });
    }

    if (currentSubscription.status === 'cancelled' || currentSubscription.status === 'completed') {
        return res.status(400).json({ error: `Subscription is already ${currentSubscription.status}.` });
    }

    // Request cancellation from Razorpay
    // Option 1: Cancel immediately
    // const cancelledSubscription = await razorpayInstance.subscriptions.cancel(razorpay_subscription_id);
    // Option 2: Cancel at the end of the current billing cycle (graceful cancellation)
    const cancelledSubscription = await razorpayInstance.subscriptions.cancel(razorpay_subscription_id, { cancel_at_cycle_end: 1 });


    console.log(`Razorpay subscription ${razorpay_subscription_id} cancellation initiated:`, cancelledSubscription);

    // The webhook (subscription.cancelled or subscription.updated if status changes)
    // should handle the definitive database update.
    // However, we can optimistically update the status here or mark it as 'pending_cancellation'.
    // For cancel_at_cycle_end, Razorpay might update the status to 'active' with schedule_change_at.
    // For now, we rely on webhook for the final status.
    // If you choose to update status here, ensure it aligns with Razorpay's response.
    // Example for immediate cancellation:
    // await prisma.subscription.update({
    //   where: { razorpaySubscriptionId: razorpay_subscription_id },
    //   data: { status: 'cancelled' }, // Or 'pending_cancellation'
    // });

    return res.status(200).json({
        message: 'Subscription cancellation initiated successfully. The subscription will be cancelled at the end of the current billing cycle.',
        status: cancelledSubscription.status, // Reflects Razorpay's response
        schedule_change_at: cancelledSubscription.schedule_change_at
    });

  } catch (error) {
    console.error('Error cancelling Razorpay subscription:', error);
    if (error.statusCode && error.error && error.error.description) {
      return res.status(error.statusCode).json({
        error: error.error.description,
        field: error.error.field,
      });
    }
    return res.status(500).json({ error: 'Internal Server Error while cancelling subscription.' });
  } finally {
    await prisma.$disconnect();
  }
}
