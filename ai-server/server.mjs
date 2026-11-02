
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '20kb' }));

// Groq uses an OpenAI-compatible API.
const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 30000,
      maxRetries: 1,
    })
  : null;

const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(groq),
    provider: 'Groq',
    model,
  });
});

app.post('/api/ai/explain', async (req, res) => {
  try {
    if (!groq) {
      return res.status(503).json({
        error: 'Groq is not configured. Add GROQ_API_KEY to ai-server/.env and restart the service.',
      });
    }

    const { type } = req.body ?? {};
    let facts;

    if (type === 'kyc') {
      const {
        wallet,
        decision,
        approvedOnRegistry,
        recordedReason,
        admin,
        updatedAt,
      } = req.body;

      if (typeof wallet !== 'string' || typeof decision !== 'string') {
        return res.status(400).json({
          error: 'Missing KYC decision context.',
        });
      }

      facts = {
        type,
        wallet,
        decision,
        approvedOnRegistry: Boolean(approvedOnRegistry),
        recordedReason: String(recordedReason || '').slice(0, 500),
        admin,
        updatedAt,
      };
    } else if (type === 'swap-error') {
      const { wallet, error } = req.body;

      if (typeof error !== 'string' || !error.trim()) {
        return res.status(400).json({
          error: 'No swap error was supplied.',
        });
      }

      facts = {
        type,
        wallet,
        error: error.slice(0, 1200),
      };
    } else {
      return res.status(400).json({
        error: 'Unsupported explanation type.',
      });
    }

    const response = await groq.responses.create({
      model,
     instructions: `
You are a friendly, professional AI assistant for a KYC-gated USD/INR exchange platform.

Your job is to explain blockchain KYC decisions in simple language.

For KYC explanations:
1. State whether the wallet is approved or not approved.
2. Explain the administrator's recorded reason in plain English.
3. Explain what the user needs to do next.
4. If no reason is recorded, explicitly say that.
5. Never invent reasons or identity information.
6. Do not repeat full wallet addresses, administrator addresses,
   timestamps, or raw technical variable names.
7. Do not make approval decisions.

For swap errors:
1. Explain what the error means.
2. Explain the likely cause.
3. Give practical troubleshooting steps.
4. Clearly state when the exact cause is uncertain.

IMPORTANT:
- Use plain text only.
- Do not use Markdown symbols such as **, ##, or bullet formatting.
- Keep the explanation natural, clear and concise.
- Use 3-4 complete sentences.
- Always finish your explanation with a complete sentence.
`,
      input: JSON.stringify(facts),
      max_output_tokens: 350,
    });

    res.json({
      explanation: response.output_text || 'The AI service returned no explanation.',
    });

  } catch (error) {
    console.error(
      'Groq AI error:',
      error?.status || '',
      error?.message || error
    );

    res.status(502).json({
      error: error?.status === 429
        ? 'Groq rate limit reached. Please wait briefly and try again.'
        : error?.status === 401
          ? 'Groq API key is invalid. Check your server configuration.'
          : 'The AI explanation could not be generated. Check the Groq API configuration and server log.',
    });
  }
});

app.listen(port, () => {
  console.log(`FX KYC AI service listening on http://localhost:${port}`);
  console.log(`AI provider: Groq | Model: ${model}`);
});
