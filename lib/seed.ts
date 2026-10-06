import type { DatabaseSync } from "node:sqlite";

// Demo data for a fictional outdoor-apparel store. Replace with your own
// knowledge base, procedures and backend integrations.

const ARTICLES: { title: string; category: string; body: string }[] = [
  {
    title: "Shipping times and costs",
    category: "Shipping",
    body: `Standard shipping (US): 3-5 business days, free on orders over $75, otherwise $6.95.
Express shipping (US): 1-2 business days, $19.95.
Orders placed before 2pm ET on a business day ship the same day.
Once an order ships you receive an email with a tracking number. Tracking can take up to 24 hours to show the first scan.`,
  },
  {
    title: "International shipping",
    category: "Shipping",
    body: `We ship to Canada, the UK, the EU, Australia and Japan.
International delivery takes 7-14 business days and costs a flat $24.95.
Import duties and taxes are collected at checkout for UK and EU orders, so there are no surprise fees on delivery. For other countries, duties may be charged by the carrier on delivery and are the customer's responsibility.`,
  },
  {
    title: "Return policy",
    category: "Returns & Refunds",
    body: `You can return unworn, unwashed items with original tags within 30 days of delivery for a full refund.
Sale items marked "Final sale" cannot be returned.
Returns are free in the US: we email a prepaid return label. International customers pay return shipping.
Refunds are issued to the original payment method within 5-7 business days after we receive the return.`,
  },
  {
    title: "Refunds for damaged or wrong items",
    category: "Returns & Refunds",
    body: `If an item arrives damaged, defective or is not what you ordered, we will refund or replace it at no cost — you do not need to return the item in most cases.
Please share the order number and a short description (a photo helps). Damaged-item claims must be made within 30 days of delivery.`,
  },
  {
    title: "Changing or cancelling an order",
    category: "Orders",
    body: `Orders can be changed or cancelled while they are still in "processing" status (usually about 1 hour after purchase, and never after they ship).
Once an order has shipped it cannot be cancelled, but it can be returned for a refund after delivery under our return policy.
Shipping address changes are possible only before the order ships.`,
  },
  {
    title: "Tracking your order",
    category: "Orders",
    body: `You can track your order using the tracking number in your shipping confirmation email, or ask our assistant with your order number and email address.
Order statuses: processing (being prepared), shipped (on its way), delivered, cancelled.
If tracking hasn't updated for 5+ business days, contact us and we will open a carrier investigation.`,
  },
  {
    title: "Payment methods",
    category: "Billing",
    body: `We accept Visa, Mastercard, American Express, Discover, PayPal, Apple Pay, Google Pay and Shop Pay.
You can split payments into 4 interest-free installments with Shop Pay Installments on orders between $50 and $3,000.
Your card is charged when the order is placed.`,
  },
  {
    title: "Sizing guide",
    category: "Products",
    body: `Our jackets and tops run true to size. If you are between sizes or plan to layer, size up.
Pants are sized by waist and inseam. Detailed measurement charts are on every product page under "Size & Fit".
Exchanges for a different size are free in the US — start a return and place a new order, or ask support to arrange an exchange.`,
  },
  {
    title: "Product warranty",
    category: "Products",
    body: `All Northwind gear is covered by our Lifetime Craftsmanship Warranty against defects in materials and workmanship.
Normal wear and tear, accidents and improper care are not covered. We repair, replace or issue store credit at our discretion.
To file a warranty claim, contact support with your order number (or approximate purchase date) and photos of the issue. Warranty claims are reviewed by our team within 3 business days.`,
  },
  {
    title: "Northwind+ membership",
    category: "Account",
    body: `Northwind+ costs $49/year and includes free express shipping, early access to sales, and 10% off full-price items.
You can cancel any time from Account > Membership. If you cancel within 14 days of joining or renewing and have not used any member benefits, you get a full refund. Otherwise the membership stays active until the end of the paid year.`,
  },
  {
    title: "Account and password help",
    category: "Account",
    body: `To reset your password, click "Forgot password" on the sign-in page and follow the emailed link (valid for 1 hour).
To change your email address, go to Account > Profile. For security, our support team cannot change the account email for you over chat.`,
  },
];

const PROCEDURES: { name: string; trigger: string; instructions: string }[] = [
  {
    name: "Refund request",
    trigger: "Customer asks for a refund or money back for an order",
    instructions: `1. Ask for the order number and the email used on the order if you don't have them, then look the order up.
2. Check eligibility against the return policy (30 days from delivery, unworn) or the damaged/wrong item policy. Search the knowledge base if unsure.
3. If the order is not eligible, explain why kindly and offer alternatives (exchange, warranty claim).
4. If eligible, confirm the exact amount with the customer before issuing the refund.
5. Refunds above the auto-approve limit need a human: escalate with a clear summary instead of refunding.`,
  },
  {
    name: "Order cancellation",
    trigger: "Customer wants to cancel an order",
    instructions: `1. Verify the order with order number + email.
2. If status is "processing", confirm with the customer and then cancel it. Tell them the refund arrives in 5-7 business days.
3. If it has shipped, explain it can't be cancelled and explain how to return it after delivery.`,
  },
  {
    name: "Upset customer or legal threats",
    trigger: "Customer is very angry, mentions a chargeback, lawyer, legal action, press or social media complaint",
    instructions: `Acknowledge their frustration sincerely and do not argue. Do not make promises beyond policy. Escalate to a human agent right away with a summary of the issue and what has been tried.`,
  },
];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const ORDERS = [
  {
    id: "NW-10421",
    email: "alex@example.com",
    name: "Alex Rivera",
    items: [{ name: "Summit Down Jacket (M, Black)", qty: 1, price: 229 }],
    total: 229,
    status: "delivered",
    tracking: "1Z999AA10123456784",
    address: "12 Pine St, Portland, OR 97205",
    created: daysAgo(12),
  },
  {
    id: "NW-10488",
    email: "alex@example.com",
    name: "Alex Rivera",
    items: [
      { name: "Trailhead Merino Tee (M)", qty: 2, price: 38 },
      { name: "Wool Hiking Socks (3-pack)", qty: 1, price: 24 },
    ],
    total: 100,
    status: "shipped",
    tracking: "1Z999AA10123456999",
    address: "12 Pine St, Portland, OR 97205",
    created: daysAgo(3),
  },
  {
    id: "NW-10502",
    email: "sam@example.com",
    name: "Sam Chen",
    items: [{ name: "Ridgeline Rain Shell (L, Olive)", qty: 1, price: 149 }],
    total: 149,
    status: "processing",
    tracking: null,
    address: "88 Market St, San Francisco, CA 94105",
    created: daysAgo(0),
  },
  {
    id: "NW-10377",
    email: "sam@example.com",
    name: "Sam Chen",
    items: [{ name: "Basecamp Fleece Pullover (L)", qty: 1, price: 79 }],
    total: 79,
    status: "delivered",
    tracking: "1Z999AA10123450001",
    address: "88 Market St, San Francisco, CA 94105",
    created: daysAgo(48),
  },
  {
    id: "NW-10515",
    email: "jordan@example.com",
    name: "Jordan Patel",
    items: [
      { name: "Alpine 45L Backpack", qty: 1, price: 189 },
      { name: "Trekking Poles (pair)", qty: 1, price: 69 },
    ],
    total: 258,
    status: "delivered",
    tracking: "1Z999AA10123457777",
    address: "5 Elm Rd, Austin, TX 78701",
    created: daysAgo(6),
  },
];

export function seed(db: DatabaseSync) {
  db.exec("BEGIN");
  try {
    const a = db.prepare("INSERT INTO articles (title, body, category) VALUES (?, ?, ?)");
    for (const art of ARTICLES) a.run(art.title, art.body, art.category);

    const p = db.prepare("INSERT INTO procedures (name, trigger, instructions) VALUES (?, ?, ?)");
    for (const proc of PROCEDURES) p.run(proc.name, proc.trigger, proc.instructions);

    const o = db.prepare(
      `INSERT INTO orders (id, customer_email, customer_name, items, total, status, tracking_number, shipping_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const ord of ORDERS) {
      o.run(ord.id, ord.email, ord.name, JSON.stringify(ord.items), ord.total, ord.status, ord.tracking, ord.address, ord.created);
    }

    db.prepare("INSERT INTO settings (key, value) VALUES ('seededAt', ?)").run(JSON.stringify(new Date().toISOString()));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
