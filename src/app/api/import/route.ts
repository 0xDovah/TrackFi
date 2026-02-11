import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'text/csv',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
];

const EXTRACTION_PROMPT = `You are a financial data extraction tool. Extract ALL transactions from this document (bank statement, receipt, invoice, or expense report).

For EACH transaction, extract:
- date: ISO format YYYY-MM-DD (use best guess if only partial date)
- description: what was purchased or the merchant name
- amount: numeric amount (positive number, no currency symbols)
- category: best matching category from this list: takeout, restaurants, coffee, transport, rent, groceries, clothing, beauty, gifts, subscriptions, entertainment, electronics, home_goods, utilities, other
- expense_type: "shared" if it looks like a household/couple expense (groceries, rent, utilities, dining out), "personal" if individual (personal clothing, individual subscription). Default to "shared" if unclear.
- payment_method: best guess from: cash, debit_card, credit_card, bizum, bank_transfer, revolut, other
- is_income: true if this is money received (salary, refund, transfer in), false if money spent
- notes: any extra context from the document (merchant address, reference number, etc). Keep brief.

Return a JSON object with this exact structure:
{
  "transactions": [
    {
      "date": "2025-01-15",
      "description": "Mercadona groceries",
      "amount": 45.67,
      "category": "groceries",
      "expense_type": "shared",
      "payment_method": "debit_card",
      "is_income": false,
      "notes": ""
    }
  ],
  "summary": "Brief description of what this document is and how many transactions were found"
}

Rules:
- Extract EVERY transaction visible in the document, don't skip any
- Amounts should always be positive numbers
- For bank statements with debit/credit columns, debit = expense, credit = income
- If the document has no transactions, return an empty transactions array
- ONLY return valid JSON, no markdown or explanation outside the JSON`;

export async function POST(request: Request) {
  // Verify authentication
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI import is not configured. Set GEMINI_API_KEY in environment variables.' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported: PDF, CSV, PNG, JPEG, WebP, HEIC` },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let result;

    if (file.type === 'text/csv') {
      // For CSV: send as text
      const text = await file.text();
      // Limit CSV content to prevent abuse
      if (text.length > 500000) {
        return NextResponse.json({ error: 'CSV file too large. Maximum 500KB of text.' }, { status: 400 });
      }
      result = await model.generateContent([
        EXTRACTION_PROMPT,
        `\n\nHere is the CSV content:\n\n${text}`,
      ]);
    } else {
      // For images and PDFs: send as inline data
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      result = await model.generateContent([
        EXTRACTION_PROMPT,
        {
          inlineData: {
            mimeType: file.type,
            data: base64,
          },
        },
      ]);
    }

    const responseText = result.response.text();

    // Extract JSON from the response (Gemini sometimes wraps in markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
      return NextResponse.json({ error: 'AI could not extract transactions from this document.' }, { status: 422 });
    }

    // Validate and sanitize each transaction
    const validated = parsed.transactions.map((t: Record<string, unknown>) => {
      const validCategories = ['takeout', 'restaurants', 'coffee', 'transport', 'rent', 'groceries',
        'clothing', 'beauty', 'gifts', 'subscriptions', 'entertainment', 'electronics', 'home_goods', 'utilities', 'other'];
      const validPaymentMethods = ['cash', 'debit_card', 'credit_card', 'bizum', 'bank_transfer', 'revolut', 'other'];
      const validExpenseTypes = ['shared', 'personal'];

      return {
        date: String(t.date || new Date().toISOString().split('T')[0]).slice(0, 10),
        description: String(t.description || 'Unknown').slice(0, 500),
        amount: Math.abs(Number(t.amount) || 0),
        category: validCategories.includes(String(t.category)) ? String(t.category) : 'other',
        expense_type: validExpenseTypes.includes(String(t.expense_type)) ? String(t.expense_type) : 'shared',
        payment_method: validPaymentMethods.includes(String(t.payment_method)) ? String(t.payment_method) : 'other',
        is_income: Boolean(t.is_income),
        notes: String(t.notes || '').slice(0, 1000),
      };
    });

    return NextResponse.json({
      transactions: validated,
      summary: String(parsed.summary || `Extracted ${validated.length} transactions`),
    });
  } catch (error) {
    console.error('Smart import error:', error);
    return NextResponse.json(
      { error: 'Failed to process document. Please try a different file format or ensure the document contains transaction data.' },
      { status: 500 }
    );
  }
}
