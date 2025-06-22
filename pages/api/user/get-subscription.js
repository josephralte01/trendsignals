import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../app/api/auth/[...nextauth]"; // Adjusted path

const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized. User session not found.' });
  }
  const userId = session.user.id;

  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        // We might want to fetch only active or recently expired/cancelled ones
        // For now, let's fetch any that could be relevant.
        // status: { in: ['active', 'pending', 'halted', 'cancelled', 'completed'] }
      },
      orderBy: {
        createdAt: 'desc', // Get the most recent one if multiple exist (should ideally be one active)
      },
    });

    if (!subscription) {
      return res.status(200).json({ subscription: null, message: 'No subscription found for this user.' });
    }

    // You might want to map plan_id to plan_name here if you store plan details in DB
    // For now, just returning what we have.
    return res.status(200).json({ subscription });

  } catch (error) {
    console.error('Error fetching user subscription:', error);
    return res.status(500).json({ error: 'Internal Server Error while fetching subscription details.' });
  } finally {
    await prisma.$disconnect();
  }
}
