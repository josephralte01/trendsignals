import razorpayInstance from '../../../lib/razorpay';
// import { getSession } from 'next-auth/react'; // If you need user session

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount provided. Amount must be a positive number.' });
    }

    // Optional: Get user session if you need to associate the order with a user
    // const session = await getSession({ req });
    // if (!session) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }
    // const userId = session.user.id; // Example: if you store user ID in session

    const options = {
      amount: Math.round(amount * 100), // Amount in the smallest currency unit (paise for INR)
      currency,
      receipt: receipt || `receipt_order_${new Date().getTime()}`, // Auto-generate a receipt if not provided
      notes: {
        // You can add any custom notes here, e.g., item_id, user_id (if available)
        // created_by: userId || 'guest_user',
        type: 'one-time_payment',
      },
    };

    const order = await razorpayInstance.orders.create(options);

    if (!order) {
      return res.status(500).json({ error: 'Razorpay order creation failed.' });
    }

    console.log('Razorpay Order Created:', order);
    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      // You might want to return the key_id to the frontend for Razorpay Checkout
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    const errorMessage = error.error && error.error.description ? error.error.description : 'Internal Server Error';
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: errorMessage, details: error.error });
  }
}
