export const mockData = {
  netWorth: 154230.50,
  income: 82500.00,
  expenses: 34120.75,
  savings: 48379.25,
  currency: '₹',

  pendingTransactions: [
    {
      id: "p1",
      amount: 450,
      merchant: "Uber",
      account: "HDFC •••• 4589",
      date: "10 mins ago",
      type: "expense",
      category: "Transport",
      detectedVia: "SMS"
    },
    {
      id: "p2",
      amount: 1200,
      merchant: "Swiggy",
      account: "ICICI •••• 1204",
      date: "2 hours ago",
      type: "expense",
      category: "Food",
      detectedVia: "Email"
    }
  ],

  recentTransactions: [
    {
      id: "t1",
      dateLabel: "Today",
      transactions: [
        { id: "tx1", merchant: "Whole Foods", time: "10:24 AM", category: "Groceries", categoryColor: "var(--success)", amount: 3200, type: "expense" },
        { id: "tx2", merchant: "Salary", time: "09:00 AM", category: "Income", categoryColor: "var(--accent)", amount: 82500, type: "income" }
      ]
    },
    {
      id: "t2",
      dateLabel: "Yesterday",
      transactions: [
        { id: "tx3", merchant: "Netflix", time: "08:00 AM", category: "Entertainment", categoryColor: "var(--accent-hover)", amount: 649, type: "expense" },
        { id: "tx4", merchant: "Shell Fuel", time: "06:30 PM", category: "Transport", categoryColor: "var(--warning)", amount: 2500, type: "expense" }
      ]
    }
  ],

  accounts: [
    { id: "a1", name: "HDFC Checking", balance: 45230.50, type: "Bank" },
    { id: "a2", name: "ICICI Credit", balance: -12450.00, type: "Card" },
    { id: "a3", name: "Zerodha Demat", balance: 121450.00, type: "Investment" }
  ],

  savingsGoals: [
    { id: "g1", name: "New MacBook", target: 120000, current: 85000, date: "by Aug 2026", color: "var(--accent)" },
    { id: "g2", name: "Emergency Fund", target: 300000, current: 150000, date: "by Dec 2026", color: "var(--success)" }
  ],

  spendingData: [
    { name: "Housing", value: 40, color: "var(--accent)" },
    { name: "Food", value: 25, color: "var(--warning)" },
    { name: "Transport", value: 15, color: "var(--text-tertiary)" },
    { name: "Entertainment", value: 10, color: "var(--danger)" },
    { name: "Other", value: 10, color: "var(--border)" }
  ]
};
