# ASSUMPTIONS & ARCHITECTURAL DECISIONS

This document logs all explicit technical decisions and assumptions made while building **Masidy (مسيدي)** on top of Cloudflare VibeSDK.

## 1. Cloudflare Infrastructure & Deployment
- **App Domain:** `app.masidy.app` (Main Web Builder UI & API).
- **User Sites Domain:** `*.masidy.app` (Hosted via Cloudflare Workers for Platforms Dispatch Namespaces).
- **Primary AI Router:** Cloudflare AI Gateway routing to Anthropic Claude 3.7 Sonnet (`claude-3-7-sonnet-20250219` / `claude-sonnet-4-6` spec) with fallback to OpenAI / Cloudflare Workers AI.
- **Storage:** Durable Objects SQLite (`ctx.storage.sql`) handles credit ledger, project records, webhooks idempotency, user auth, and published site metadata. For production deployment, Cloudflare D1, KV, R2, and Dispatch Namespaces are bound via `wrangler.json`.

## 2. LLM & Agent Workflow
- **Plan-then-Approve Flow:** Before writing code, the agent creates a structured plan in Arabic (pages, components, tech stack) stored in state. The UI displays two distinct CTAs: **"وافق وابني"** (Approve and Build) and **"عدّل الخطة"** (Edit Plan). No preview code is generated until approved.
- **Prompt Injection & Moderation:** Incoming prompts are pre-screened against injection patterns and prohibited content prior to dispatching to AI Gateway.

## 3. Credit Ledger & Monies
- **Initial Grant:** 50 free credits assigned on first sign-up.
- **Action Tariffs:**
  - Full App Generation (Build): 10 credits.
  - Conversational Edit: 3 credits (range 2-5).
  - Publishing / Re-publishing: Free (0 credits).
- **Atomic Deduction & Refund:** Credits are deducted prior to starting generation. If the agent fails, encounters a build error, or crashes, credits are automatically refunded to the user ledger with a transaction record `refund_failed_build`.
- **Payment Providers:** Paymob (Egypt / MENA) and Stripe. Webhook signatures are verified with SHA-256 HMAC / Stripe signatures and processed idempotently via `processed_webhooks` table.

## 4. UI/UX & RTL Design System
- **Language:** Arabic-first (`dir="rtl"`, `lang="ar"`), with i18n structure for English.
- **Typography:** `IBM Plex Sans Arabic` imported via Google Fonts.
- **Color Tokens:**
  - Background: `#fbfbfd`
  - Cards: `#ffffff`
  - Ink / Text: `#0b0f1a`
  - Muted: `#667085`
  - Line / Border: `#e6e8ee`
  - Brand Accent: `#2d5bff`
- **Visual Effects:** Slow drifting pastel ambient gradient blobs (`#ffd6e7`, `#d5dcff`, `#ffe3c7`, `#d9f0ff`) respecting `@media (prefers-reduced-motion: reduce)`.
- **Border Sweep:** Dynamic rotating conic gradient with soft glowing drop-shadow around the central prompt box.

## 5. Security & Domain Governance
- **Reserved Slugs:** `www`, `app`, `api`, `admin`, `mail`, `status`, `masidy`, `support`, `billing`, `login`, `signup`.
- **Custom Domains:** Cloudflare for SaaS Custom Hostnames integration with DNS record guidance (CNAME to `dispatch.masidy.app` and TXT verification key).
- **Report Abuse:** Published user sites render an unobtrusive Masidy badge with a "الإبلاغ عن محتوى" (Report Abuse) flag linking directly to `https://app.masidy.app/report-abuse`.
