# YL Spark Commercial MVP

This update adds:
- Supabase email login
- free usage limit
- API-side blocking after the free limit
- Mercado Pago payment link button
- legal pages: Terms, Privacy, Refunds, AI/Educational Disclaimer
- visual supports in generated lesson plans

## Files to upload to GitHub

Upload/replace:

- index.html
- styles.css
- app.js
- package.json
- vercel.json
- api/generate.js
- api/config.js
- api/me.js
- terms.html
- privacy.html
- refunds.html
- disclaimer.html
- supabase-setup.sql

## Vercel environment variables

Add these in Vercel → Project → Settings → Environment Variables:

ANTHROPIC_API_KEY = your Anthropic key
SUPABASE_URL = your Supabase project URL
SUPABASE_ANON_KEY = your Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY = your Supabase service role key
FREE_GENERATION_LIMIT = 3
MERCADOPAGO_PAYMENT_LINK = your Mercado Pago payment link

After changing env vars, redeploy.

## Supabase

1. Create a Supabase project.
2. Go to SQL Editor.
3. Paste and run `supabase-setup.sql`.
4. Go to Authentication settings.
5. Add your Vercel URL as an allowed redirect URL.

## Payment MVP

This version uses a Mercado Pago payment link. After payment, manually mark the teacher as paid:

update public.profiles set plan = 'paid' where email = 'teacher@email.com';

Later, you can automate this with Mercado Pago webhooks.


## Password + Google login update

This version uses Supabase Auth with:
- email + password sign up
- email + password login
- password reset email
- optional Google OAuth login

### Supabase settings needed

In Supabase → Authentication → Providers:
- Enable Email provider.
- Enable Google only after creating Google OAuth credentials.

In Supabase → Authentication → URL Configuration:
- Site URL: `https://yl-spark-app.vercel.app`
- Redirect URLs:
  - `https://yl-spark-app.vercel.app`
  - `https://yl-spark-app.vercel.app/**`

For Google login, Supabase will show the callback URL to add in Google Cloud Console. It normally looks like:
`https://YOUR-PROJECT.supabase.co/auth/v1/callback`

## Images and photos

This update adds visual-support sections and AI image prompts to lesson plans, activity adaptations and flashcards. It does not generate actual image files yet. Real image generation requires connecting a separate image API such as OpenAI Images, Replicate, Ideogram, or Stability, and adding cost controls.
