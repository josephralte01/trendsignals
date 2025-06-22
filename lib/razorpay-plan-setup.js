const razorpayInstance = require('./razorpay');

// Define your plans here
// Note: Razorpay plan IDs are auto-generated. You'll need to store or retrieve these
// if you want to reference them directly later without relying on name/description.
// For this example, we're not storing them, but in a real app, you might want to.
const plansToCreate = [
  {
    period: 'monthly', // or 'weekly', 'yearly', 'daily'
    interval: 1,       // e.g., for period 'monthly' and interval 1, it's every 1 month
    item: {
      name: 'Monthly Basic Plan',
      amount: 99900, // Amount in paise (e.g., 99900 paise = ₹999.00)
      currency: 'INR',
      description: 'Basic monthly subscription with standard features.',
    },
    notes: {
      plan_group: 'standard_subscriptions',
      plan_tier: 'basic',
    },
  },
  {
    period: 'monthly',
    interval: 1,
    item: {
      name: 'Monthly Premium Plan',
      amount: 199900, // Amount in paise (e.g., 199900 paise = ₹1999.00)
      currency: 'INR',
      description: 'Premium monthly subscription with advanced features.',
    },
    notes: {
      plan_group: 'standard_subscriptions',
      plan_tier: 'premium',
    },
  },
  // You can add more plans here, for example, annual plans:
  // {
  //   period: 'yearly',
  //   interval: 1,
  //   item: {
  //     name: 'Annual Basic Plan',
  //     amount: 999900, // e.g., ₹9999.00
  //     currency: 'INR',
  //     description: 'Basic annual subscription (save with yearly billing).',
  //   },
  //   notes: {
  //     plan_group: 'annual_subscriptions',
  //     plan_tier: 'basic',
  //   },
  // }
];

async function createPlans() {
  console.log('Attempting to create Razorpay plans...');
  for (const planData of plansToCreate) {
    try {
      const existingPlans = await razorpayInstance.plans.all({
        period: planData.period,
        interval: planData.interval,
        item: {
          name: planData.item.name,
          currency: planData.item.currency,
        }
      });

      // A very basic check to see if a plan with the same name, period, interval, and currency exists.
      // Razorpay's API might not offer exact filtering to prevent duplicates based on all item fields easily.
      // A more robust check might involve fetching all plans and filtering locally or using notes.
      const planExists = existingPlans.items.some(
        p => p.item.name === planData.item.name &&
             p.period === planData.period &&
             p.interval === planData.interval &&
             p.item.amount === planData.item.amount // Also check amount
      );

      if (planExists) {
        console.log(`Plan "${planData.item.name}" seems to already exist. Skipping creation.`);
        // If you need the existing plan ID, you could try to find it in existingPlans.items
        // const existing = existingPlans.items.find(p => p.item.name === planData.item.name ...);
        // console.log(`Existing Plan ID: ${existing.id}`);
      } else {
        const createdPlan = await razorpayInstance.plans.create(planData);
        console.log(`Successfully created plan: ${createdPlan.item.name} (ID: ${createdPlan.id})`);
      }
    } catch (error) {
      console.error(`Failed to create plan "${planData.item.name}":`, error.error ? error.error.description : error.message);
      // If error.error exists, it's a Razorpay API error object
      if (error.error && error.error.field) {
        console.error(`Field in error: ${error.error.field}`);
      }
    }
  }
  console.log('Plan creation process finished.');
}

// If this script is run directly (e.g., `node lib/razorpay-plan-setup.js`)
if (require.main === module) {
  // Ensure environment variables are loaded if you use a .env file
  // For example, if you use `dotenv` package:
  // require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

  // Re-check for keys after potential dotenv load
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('Razorpay Key ID or Key Secret is not defined in environment variables.');
    console.error('Please ensure your .env.local file is correctly set up with RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    process.exit(1);
  }

  createPlans().catch(error => {
    console.error('An unexpected error occurred during plan setup:', error);
    process.exit(1);
  });
}

module.exports = { createPlans, plansToCreate };
