/**
 * Grounding data for the in-browser chat worker (LFM2-24B via Transformers.js).
 *
 * The worker injects EVERY chunk below into the system prompt on every turn.
 * LFM2-24B has a 128k context and hybrid conv/attention architecture, so the
 * ~2k tokens of full resume content costs almost nothing to prefill.
 *
 * Source of truth mirrors `src/components/resume/Resume.jsx`. When the resume
 * changes, update both.
 */

export const FACT_CHUNKS = [
  // ── Identity + current status ────────────────────────────────────────────
  'Aaron Rohrbacher is a Senior Software & DevOps Engineer based in Portland, Oregon. He takes a language-agnostic approach — he chooses the language and framework for the problem, not the other way around, and is comfortable in just about any stack these days. His GitHub is github.com/aaronrohrbacher and his LinkedIn is linkedin.com/in/aaronrohrbacher. As of March 2026 he is actively seeking his next senior or lead engineering role and is available to start immediately.',

  // ── About (from resume About tab) ────────────────────────────────────────
  'About Aaron (in his own words): "I\'m a senior software and DevOps engineer with language-agnostic proficiency in programming and DevOps, and deep expertise in fiduciary finance, HR, payroll, and logistics. I deliver creative, effective, and timely solutions across AWS, GCP, and Azure. Most recently at Forbes AAC, I led emergency stabilization and a ground-up enterprise rebuild of an assistive technology platform, including full rewrites of all native apps (iOS, Android, macOS, Windows, Linux). At SPARQ, I drove AI-powered conversational experiences and infrastructure for enterprise clients including a payroll overhaul serving 500k+ employees. AWS Certified Cloud Practitioner and Certified Developer – Associate. AWS DevOps Engineer – Professional in progress. Outside of engineering, I play saxophone and am learning instrument repair."',

  // ── Job 1: Forbes AAC (most recent) ──────────────────────────────────────
  'Forbes AAC — Lead Software Development Engineer (December 2024 – March 2026, Mansfield OH, remote). This was Aaron\'s most recent role. Responsibilities and accomplishments: (1) Stabilized a critically failing Ruby 2.6 / Ember 3.0 platform (both past end-of-life), mitigating imminent data and platform loss. Built tooling to convert deprecated Ember code into editable JavaScript — preserving years of Speech Language Pathologist refinements. (2) Negotiated with Heroku and upgraded infrastructure to prevent complete loss of the application, leaving everything operational with satisfied stakeholders. (3) Rescued Android and iOS apps from deprecation-driven crashes, bringing both to current standards and ensuring uninterrupted service for users who depend on them for daily communication. (4) Architected a complete infrastructure rebuild on Next.js — injecting compiled legacy Ember JS for continuity — while medical professionals continued refining decade-old features without interruption. (5) Fully rebuilt cross-platform apps in native code: iOS (Swift), Android (Java/Kotlin), macOS (Swift with native navigation), Windows & Linux (Qt on Rust), replacing deprecated Cordova. (6) Redesigned content sync from one-asset-at-a-time to compressed, licensed package delivery — saving thousands monthly in data transfer costs and enabling better offline use for AAC users.',

  // ── Job 2: SPARQ ─────────────────────────────────────────────────────────
  'SPARQ — Technical Lead & Senior Software Engineer (August 2022 – February 2025, Atlanta GA, remote). Aaron was consulted to Forbes AAC via SPARQ and then hired directly by Forbes AAC. Responsibilities and accomplishments: (1) Served as lead system architect building microservices and APIs on AWS Lambda + Node.js with third-party services — achieving significant cloud infrastructure cost savings. (2) Completed phase-one production deployment of a payroll system overhaul serving 500k+ employees for a global logistics leader. (3) Modernized internal API processes for a new payroll vendor using GCP Cloud Run functions (Python, Java, Node.js), resulting in substantial cost savings. (4) Guided offshore development teams on ADO CI/CD best practices with GCP deployment and local environment virtualization. (5) Mentored junior programmers and introduced modern cloud computing concepts to offshore development teams and stakeholder leadership. (6) Led in-house team to create AI-based conversational experiences for internal client websites. (7) Served on security and risk management teams — penetration testing and risk assessment.',

  // ── Job 3: Nuel Cloud Computing LLC ─────────────────────────────────────
  'Nuel Cloud Computing LLC — Proprietor, Systems Architect & Engineering Director (August 2020 – February 2024, Portland OR). This was Aaron\'s own company. Responsibilities and accomplishments: (1) Architected and developed a proprietary AWS solution to provision containerized LAMP stacks (PHP) via ECS and EKS for WordPress designers and PHP developers. Built in Node.js, Express, Python, Serverless Framework, AWS Lambda, API Gateway, ECS/EKS, and Cognito. (2) Architected and designed customer dashboard for automated signup, migration from legacy systems, customized stack preferences, user profiles, and PHP/WordPress plugin management. Frontend in React; backend in Node.js, PHP, and Bash. (3) Delivered the fastest WordPress/PHP installation on the market — integrated backend caching and CloudFront CDN optimized for WordPress/PHP. (4) Provided security and vulnerability assessments, automating security best practices throughout the system with nearly zero downtime.',

  // ── Job 4: Nordic Semiconductor ─────────────────────────────────────────
  'Nordic Semiconductor — Software Engineer II (February 2022 – March 2022, Portland OR). Responsibilities and accomplishments: (1) Developed test automation tools and scripts for AWS in Node.js using React, Jest, Cypress, Linux, and Istanbul. (2) Built Nordic\'s first "thingy lab" — enabling IoT device experiments on a proprietary dashboard in novel hardware combinations.',

  // ── Job 5: Fiduciary Benchmarks ─────────────────────────────────────────
  'Fiduciary Benchmarks — Junior Software Development Engineer (July 2018 – August 2021, Lake Oswego OR). Responsibilities and accomplishments: (1) Designed and maintained automated E2E test suite using JavaScript and Cypress. (2) Designed and maintained sophisticated manual regression test suite using Cucumber and BDD best practices. (3) Analyzed, debugged, and communicated issues reported by data operations and service teams. (4) Reliably communicated test results to Development Manager and agile development team. (5) Implemented WalkMe digital adoption platform — step-by-step in-app guidance ensuring client success. Note: Fiduciary Benchmarks is a benchmarking company, not a bank.',

  // ── Job 6: Planet Argon (career start) ──────────────────────────────────
  'Planet Argon — Web Development Intern (January 2018 – February 2018, Portland OR). This was where Aaron\'s professional career began. Client projects for NIKE, Aloha Foods, and PAC Global — test suite enhancements, sitemaps, integration, and advanced Spree eCommerce integration including custom roles.',

  // ── Skill group: AI & Machine Learning ───────────────────────────────────
  'AI & Machine Learning skills: PyTorch, LLM Implementation & Fine-tuning, NLP, Conversational AI, Amazon Lex, Amazon Polly, Amazon Transcribe, Amazon Q. Aaron\'s AI/ML work is applied and hands-on — shipping real systems — not academic research. He is not a PhD-level ML researcher.',

  // ── Skill group: Languages ──────────────────────────────────────────────
  'Programming languages — Aaron is language-agnostic: he chooses the language and framework that fit the problem, not the other way around, and is comfortable in just about any stack these days. For reference, the languages he has shipped production work in include JavaScript, TypeScript, Node.js, Python, Ruby, Java, Kotlin, Swift, Rust, Bash, PowerShell, PHP, and SQL. Do not pitch him as a "Python guy" or a specialist in any one language — the list is representative, not exhaustive, and the point is that he picks the tool for the job.',

  // ── Skill group: Frameworks & Libraries ─────────────────────────────────
  'Frameworks & libraries: Next.js, React, Ruby on Rails, Express, Vue.js, Angular, Ember.js, SST (Serverless Stack), Serverless Framework, Tailwind CSS, SCSS/SASS.',

  // ── Skill group: Cloud — AWS ────────────────────────────────────────────
  'AWS services Aaron has used hands-on: Lambda, ECS/EKS, EC2, API Gateway, CloudFormation, VPC, Route53, IAM, Cognito, S3, CloudFront, RDS, DynamoDB, SES/SNS/SQS, CloudWatch, Cost Management, Systems Manager. AWS is his primary cloud.',

  // ── Skill group: Cloud — GCP & Azure ────────────────────────────────────
  'GCP & Azure services: Cloud Run, Cloud Functions, Compute Engine, Cloud SQL, Pub/Sub, Azure DevOps, plus Azure equivalents of core AWS services. He has shipped production code on all three major clouds.',

  // ── Skill group: Infrastructure & DevOps ────────────────────────────────
  'Infrastructure & DevOps: Docker, Kubernetes, Terraform, AWS CDK, CloudFormation, GitHub Actions, GitLab CI, Azure DevOps, Jenkins, Microservices, Serverless Architecture. He has designed and operated serverless microservices architectures end-to-end.',

  // ── Skill group: Mobile & Desktop ───────────────────────────────────────
  'Mobile & desktop development: iOS (Swift/SwiftUI), Android (Java/Kotlin), macOS (Swift/AppKit), Windows & Linux (Qt/Rust), React Native, Cordova. Most of this experience came from the Forbes AAC native rewrite.',

  // ── Skill group: Databases ──────────────────────────────────────────────
  'Databases: PostgreSQL, MySQL/MariaDB, MongoDB, DynamoDB, Redis, ElastiCache.',

  // ── Skill group: Testing & QA ───────────────────────────────────────────
  'Testing & QA: Cypress, Jest, Jasmine, Mocha, Selenium, Puppeteer, TestNG, Rest-assured, BDD/Cucumber.',

  // ── Skill group: Security & Compliance ──────────────────────────────────
  'Security & compliance: Penetration Testing, Burp Suite, OWASP Top 10, SOC 2 Preparation, IAM & Access Control, Encryption & Data Protection. Aaron served on SPARQ\'s security and risk management team doing pentesting and risk assessment. He is not a dedicated security engineer.',

  // ── Skill group: Frontend & Design ──────────────────────────────────────
  'Frontend & design: HTML5, CSS3, Bootstrap, Responsive Design, Accessibility (WCAG), UI/UX Optimization, Adobe Creative Suite, GIMP.',

  // ── Skill group: Additional Technologies ────────────────────────────────
  'Additional technologies: WordPress/PHP, VoIP/SIP Trunking, WebRTC, Real-time Communication, CDN & Caching (Varnish, Redis), Linux administration (Ubuntu, CentOS, Debian, Arch), Agile/Scrum.',

  // ── Certifications ──────────────────────────────────────────────────────
  'Certifications: AWS Certified Cloud Practitioner (held), AWS Certified Developer – Associate (held), AWS Certified DevOps Engineer – Professional (in progress).',

  // ── Personal / hobbies ──────────────────────────────────────────────────
  'Outside of engineering, Aaron plays saxophone and is learning instrument repair. He also plays clarinet and records music as an amateur audio engineer. He has one brother.',

  // ── Negative facts (explicit anti-hallucination anchor) ─────────────────
  'What Aaron is NOT: He has never worked for a government agency, a hospital or healthcare organization, or a bank. Fiduciary Benchmarks (2018–2021) is a benchmarking company, not a bank. Forbes AAC was his MOST RECENT employer, not his first — his career began in January 2018 at Planet Argon. He is not a PhD-level or academic ML researcher; his AI/ML work is applied. Do not invent employers, degrees, certifications, or personal details that are not stated above.',
];

// This string MUST match the SYSTEM_PROMPT used during LFM2 fine-tuning
// (see training/finetune_lfm2_kaggle.ipynb, cell that builds the formatted
// dataset). Drift here will degrade the fine-tune's behavior.
export const AARON_CHAT_SYSTEM_PROMPT = `You are A-A-Bot, a chat assistant on Aaron Rohrbacher's portfolio site. You know Aaron's professional background, skills, and projects.

Follow these rules in order, every turn:

1. READ the facts below before answering. Your answer must be supported by an explicit statement in the facts.
2. DO NOT infer, calculate, estimate, or combine facts to produce new claims. If the facts say "January 2018" but don't say "8 years of experience," you do NOT compute the difference — you quote what's there or decline.
3. DO NOT fabricate. If a name, date, number, employer, project, or detail is not literally written in the facts, you do not know it. Making up plausible-sounding information is the worst thing you can do.
4. If the facts don't answer the question, say: "I don't have that info — just say 'connect me' and I'll open a live chat with Aaron!"
5. For off-topic questions (other people, philosophy, politics, current events, weather, math), briefly redirect back to Aaron.
6. Never ask the user to upload, provide, or share any document — you already know Aaron's background.
7. Answer briefly — one or two sentences.`;

// Domain-specific words — if a question contains one of these, it's on-topic.
// Generic question words (what, who, he, does) are NOT sufficient on their own.
// Used by src/lib/chatAgent.mjs for off-topic filtering before the model runs.
export const DOMAIN_RE = /\b(work|worked|job|role|know|knows|skill|skills|language|languages|code|coding|built|build|project|projects|cert|certs|certification|cloud|aws|gcp|azure|docker|k8s|devops|python|rust|swift|kotlin|java|typescript|javascript|ruby|sql|bash|php|startup|cto|engineer|experience|background|career|portfolio|company|employer|sparq|forbes|nuel|nordic|fiduciary|argon|ai|ml|llm|pytorch|nlp|saxophone|clarinet|music|portland|oregon|infrastructure|terraform|kubernetes|deploy|programming|tools|hire|available|seeking|role)\b/i;
