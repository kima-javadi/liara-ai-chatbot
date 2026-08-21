/**
 * Canned conversation data for the design prototype.
 *
 * Everything here is replaced by the streaming `/api/chat` response once the
 * retrieval backend lands. The shapes deliberately match what the real route
 * will emit — prose with fenced code blocks, sources derived from chunk
 * metadata, and follow-up chips parsed from the trailing marker — so the
 * components below survive the swap unchanged.
 */

export type Source = { title: string; url: string };

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  suggestions?: string[];
};

export const QUICK_ACTIONS = [
  { label: "عیب‌یابی لاگ خطا", prompt: "این لاگ خطای استقرار را بررسی کن" },
  { label: "ساخت liara.json", prompt: "برای پروژه Next.js من liara.json بساز" },
  { label: "دستورات CLI", prompt: "دستورات اصلی Liara CLI را نشان بده" },
  { label: "اتصال دیتابیس", prompt: "چطور به دیتابیس MySQL در لیارا وصل شوم؟" },
];

const NEXTJS_ANSWER = `برای استقرار یک پروژه **Next.js** روی لیارا، ابتدا فایل \`liara.json\` را در ریشه پروژه بسازید:

\`\`\`json:liara.json
{
  "platform": "next",
  "app": "my-next-app",
  "port": 3000,
  "build": {
    "location": "germany"
  },
  "disks": [
    {
      "name": "uploads",
      "mountTo": "public/uploads"
    }
  ]
}
\`\`\`

نکته مهم: مقدار \`port\` باید با پورتی که برنامه روی آن گوش می‌دهد یکسان باشد. اگر از \`build.location\` استفاده نکنید، بیلد در ایران انجام می‌شود که برای پکیج‌های npm ممکن است کندتر باشد.

سپس با دستور زیر برنامه را مستقر کنید:

\`\`\`bash
liara deploy --app my-next-app --port 3000 --detach
\`\`\`

اگر هنوز Liara CLI را نصب نکرده‌اید:

\`\`\`bash
npm install -g @liara/cli
liara login
\`\`\``;

const ERROR_ANSWER = `ریشه خطا مشخص است: بیلد در مرحله نصب وابستگی‌ها به دلیل ناسازگاری نسخه‌ها شکست خورده و \`npm ci\` نتوانسته \`package-lock.json\` را با \`package.json\` تطبیق دهد.

\`\`\`txt
npm ERR! cipm can only install packages when your package.json
npm ERR! and package-lock.json are in sync.
\`\`\`

برای رفع مشکل، لاک‌فایل را به‌روزرسانی و کامیت کنید:

\`\`\`bash
npm install
git add package-lock.json
git commit -m "sync lockfile"
liara deploy
\`\`\`

اگر می‌خواهید مطمئن شوید فایل‌های اضافی به بیلد ارسال نمی‌شوند، یک \`.liaraignore\` بسازید:

\`\`\`txt:.liaraignore
node_modules
.next
.git
\`\`\``;

export const CONVERSATION: Message[] = [
  {
    id: "u1",
    role: "user",
    content: "چطور یک پروژه Next.js را روی لیارا دیپلوی کنم؟",
  },
  {
    id: "a1",
    role: "assistant",
    content: NEXTJS_ANSWER,
    sources: [
      {
        title: "استقرار برنامه‌های Next.js",
        url: "https://docs.liara.ir/paas/nextjs/deploy",
      },
      {
        title: "آشنایی با فایل liara.json",
        url: "https://docs.liara.ir/paas/liarajson",
      },
      {
        title: "نصب و راه‌اندازی Liara CLI",
        url: "https://docs.liara.ir/references/cli/about",
      },
    ],
    suggestions: [
      "چطور دامنه اختصاصی وصل کنم؟",
      "متغیرهای محیطی را کجا تنظیم کنم؟",
      "دیسک برای آپلود فایل بسازم",
    ],
  },
  {
    id: "u2",
    role: "user",
    content: `دیپلوی من با این خطا شکست خورد:

npm ERR! cipm can only install packages when your package.json and package-lock.json are in sync
npm ERR! Missing: sharp@0.33.2 from lock file
ERROR: build failed with exit code 1`,
  },
  {
    id: "a2",
    role: "assistant",
    content: ERROR_ANSWER,
    sources: [
      {
        title: "خطاهای رایج در زمان بیلد",
        url: "https://docs.liara.ir/paas/troubleshooting",
      },
      {
        title: "فایل .liaraignore",
        url: "https://docs.liara.ir/paas/liaraignore",
      },
    ],
    suggestions: [
      "لاگ‌های زنده برنامه را ببینم",
      "بیلد را روی سرور آلمان اجرا کنم",
      "چطور به نسخه قبلی برگردم؟",
    ],
  },
];
