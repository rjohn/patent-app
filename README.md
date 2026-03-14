# PatentOS — USPTO Patent Portfolio Manager

A full-stack web application for managing your USPTO patent portfolio, tracking patent families, monitoring maintenance fee deadlines, and generating reports.

## Tech Stack

- **Next.js 14** — Full-stack React framework (App Router)
- **PostgreSQL + Supabase** — Database + Auth + File Storage
- **Prisma** — Type-safe ORM
- **Tailwind CSS** — Styling
- **D3.js** — Patent family tree visualization
- **Vercel** — Deployment

## Features

- 📋 Patent portfolio dashboard with status overview
- 🌳 Patent family tree visualization (D3.js)
- ⏰ Maintenance fee deadline tracker with urgency alerts
- 📤 USPTO XML & JSON file import
- 🔌 USPTO PatentsView API integration
- 📄 PDF report generation
- 👥 Multi-user support (via Supabase Auth)

## Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd patent-app
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Copy your Project URL and API keys
3. Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

### 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to Supabase
npm run db:push

# (Optional) Open Prisma Studio
npm run db:studio
```

### 4. USPTO API Key (Optional)

Get a free API key from [PatentsView](https://patentsview.org/apis/getting-started):

```env
USPTO_API_KEY=your-api-key
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add your environment variables in the Vercel dashboard.

## Project Structure

```
patent-app/
├── app/
│   ├── api/
│   │   └── patents/
│   │       └── import/     # USPTO file import endpoint
│   ├── dashboard/           # Main dashboard
│   ├── patents/             # Patent browser & detail
│   ├── families/            # Patent family trees
│   ├── deadlines/           # Maintenance fee tracker
│   ├── reports/             # Report generation
│   └── import/              # File upload UI
├── components/
│   ├── Sidebar.tsx
│   └── ui/                  # Reusable UI components
├── lib/
│   ├── prisma.ts            # Database client
│   ├── supabase.ts          # Auth & storage client
│   ├── uspto-parser.ts      # XML/JSON parser
│   └── uspto-api.ts         # PatentsView API client
├── prisma/
│   └── schema.prisma        # Database schema
└── ...
```

## Data Models

- **Patent** — Core patent record with all USPTO bibliographic data
- **PatentFamily** — Groups of related patents
- **MaintenanceFee** — Fee deadlines with due dates and payment tracking
- **PriorityClaim** — Priority claim chains
- **PatentDocument** — Attached documents (stored in Supabase Storage)
- **DataUpload** — Import history and status

## USPTO Data Sources

- **Bulk XML**: Download from [USPTO Bulk Data](https://bulkdata.uspto.gov/)
- **PatentsView API**: [patentsview.org](https://patentsview.org/apis/api-endpoints/patents)
