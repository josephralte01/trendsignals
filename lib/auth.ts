import { getSession } from 'next-auth/react';

export const requireAuth = async (context) => {
  const session = await getSession(context);
  if (!session) {
    return {
      redirect: {
        destination: '/sign-in',
        permanent: false,
      },
    };
  }
  return session;
};
