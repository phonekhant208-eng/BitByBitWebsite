# 🎯 BitByBit — GED Math Quiz & Practice Platform

**BitByBit** is an interactive web platform designed to help students prepare for and excel in the **GED Mathematics exam**. It provides practice quizzes, automated access token distribution via Telegram, and seamless payment integration.

> ⚙️ **System Architecture Note:** This repository hosts the client-facing frontend. The automated payment pipeline, Vision OCR verification engine, and Telegram bot handling are managed in the separate **[KBZPay n8n Backend Repository](https://github.com/phonekhant208-eng/kbzpay-n8n-backend)**.

---

## 🚀 Key Features

- **Interactive Math Quizzes:** Practice targeted GED math questions with real-time feedback and performance tracking.
- **Automated Activation Code System:** Users purchase access and receive automated single-use activation keys.
- **KBZPay Payment Processing:** Automated payment verification workflow powered by Vision AI OCR.
- **Telegram Bot Integration:** Instant delivery of activation codes directly to the user's Telegram account.
- **Secure Data Management:** Backend powered by Supabase with strict Row Level Security (RLS) and RPC database functions.

---

## 🛠️ Tech Stack

| Layer | Technologies | Source Code |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5, Tailwind CSS, JavaScript (ES6+) | *Current Repository* |
| **Backend & Database** | Supabase (PostgreSQL, Row Level Security, RPC functions) | - |
| **Automation Engine** | n8n (Hosted via Docker on Ubuntu) | [n8n Workflow Repository 🔗](https://github.com/phonekhant208-eng/kbzpay-n8n-backend) |
| **Integrations** | Telegram Bot API, Groq AI Vision, KBZPay | - |

---

## 📐 System Architecture & Data Flow

```mermaid
graph TD
    A[Student / User] -->|1. Takes Quiz / Requests Access| B[BitByBit Website]
    B -->|2. Submits Payment Receipt| C[n8n Automation Engine]
    C -->|3. Verifies Payment & Queries RLS| D[(Supabase Database)]
    D -->|4. Generates Activation Token| C
    C -->|5. Sends Activation Code| E[Telegram Bot]
    E -->|6. Delivers Code to User| A
