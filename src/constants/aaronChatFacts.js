/**
 * Grounding data for the in-browser chat worker.
 * Keep aligned with `src/info/Info.jsx` when facts change.
 *
 * FACT_CHUNKS — small atomic sentences for the generation model.
 * FACT_INDEX — keyword-scored retrieval index for selecting relevant facts.
 * findRelevantFacts() — deterministic keyword matching to find the best facts.
 * DOMAIN_RE — regex for on-topic detection (career/tech domain words).
 */

export const FACT_CHUNKS = [
  'Aaron Rohrbacher is a Lead AI/ML Software Engineer and DevOps Architect based in Portland, Oregon. He wrapped up his role as Lead Software Development Engineer at Forbes AAC in March 2026 and is actively seeking his next role, available to start immediately.',
  'At Forbes AAC, Aaron led stabilization of a legacy Ruby and Ember stack and an enterprise rebuild using Next.js. He rebuilt native apps: iOS in Swift, Android in Java and Kotlin, macOS in Swift, Windows and Linux in Qt and Rust.',
  'At SPARQ, Aaron was technical lead on enterprise AI projects, AWS cloud migrations, and conversational AI. He worked on payroll and logistics systems at scale serving over 500,000 employees.',
  'Aaron\'s earlier employers include Nuel Cloud (AWS LAMP provisioning), Nordic, Fiduciary Benchmarks, and Planet Argon.',
  'Aaron\'s programming languages include JavaScript, TypeScript, Python, Ruby, Java, Kotlin, Swift, Rust, PHP, SQL, and Bash.',
  'Aaron works across AWS, GCP, and Azure. He holds AWS Cloud Practitioner and Developer Associate certifications and is pursuing AWS DevOps Professional.',
  'Aaron\'s AI and ML stack includes PyTorch, LLM fine-tuning, NLP, and Amazon AI services: Lex, Polly, Transcribe, and Q.',
  'Aaron\'s infrastructure and DevOps tools include Docker, Kubernetes, Terraform, AWS CDK, and SST.',
  'Aaron built this portfolio site using Next.js, SST, and AWS. Other projects: Klear (a KWin window manager plugin), Thinger (Python video processing), a PyTorch GPT-2 trained on George Carlin transcripts, and the Nuel API.',
  'Aaron plays saxophone and is a musician outside of his engineering career.',
];

export const AARON_CHAT_SYSTEM_PROMPT = `You are a helpful assistant on Aaron Rohrbacher's portfolio site. Answer the question using ONLY the provided facts. One to two sentences. Do not add information not in the facts. If the facts don't cover the question, say: "I don't have that info — just say 'connect me' and I'll open a live chat with Aaron!"`;

// ── Fact retrieval index ─────────────────────────────────────────────────────
// Each entry maps question keywords to a specific fact chunk.
// `validate` is a regex the model output MUST match to be considered grounded.

export const FACT_INDEX = [
  {
    keywords: ['current', 'now', 'today', 'job', 'title', 'role', 'position', 'company', 'employer', 'doing', 'seeking', 'available', 'hire', 'hiring', 'portland', 'oregon', 'where', 'live', 'based', 'location', 'about', 'background', 'who', 'overview', 'tell', 'bio', 'lead', 'architect'],
    validate: /portland|architect|seeking|forbes/i,
    factIndex: 0,
  },
  {
    keywords: ['forbes', 'ruby', 'ember', 'legacy', 'native', 'ios', 'android', 'macos', 'windows', 'linux', 'qt', 'rebuild', 'stabilization'],
    validate: /forbes/i,
    factIndex: 1,
  },
  {
    keywords: ['sparq', 'enterprise', 'payroll', 'logistics', 'conversational', 'migration', 'migrations', 'employees', 'scale'],
    validate: /sparq/i,
    factIndex: 2,
  },
  {
    keywords: ['nuel', 'nordic', 'fiduciary', 'argon', 'planet', 'earlier', 'previous', 'past', 'before', 'other', 'history', 'employers'],
    validate: /nuel|nordic|fiduciary|planet.?argon/i,
    factIndex: 3,
  },
  {
    keywords: ['language', 'languages', 'programming', 'coding', 'code', 'program', 'javascript', 'typescript', 'python', 'ruby', 'java', 'kotlin', 'swift', 'rust', 'php', 'sql', 'bash', 'know', 'knows'],
    validate: /javascript|python|typescript|ruby|kotlin|swift|rust|php|sql|bash/i,
    factIndex: 4,
  },
  {
    keywords: ['cloud', 'aws', 'gcp', 'azure', 'certification', 'certifications', 'certified', 'cert', 'certs', 'practitioner', 'associate', 'professional'],
    validate: /cloud practitioner|developer associate/i,
    factIndex: 5,
  },
  {
    keywords: ['ai', 'ml', 'machine', 'learning', 'pytorch', 'llm', 'nlp', 'tuning', 'lex', 'polly', 'transcribe', 'artificial', 'intelligence', 'deep'],
    validate: /pytorch|llm|nlp|lex|polly/i,
    factIndex: 6,
  },
  {
    keywords: ['infrastructure', 'devops', 'docker', 'kubernetes', 'k8s', 'terraform', 'cdk', 'sst', 'container', 'deploy', 'deployment', 'ci', 'cd', 'pipeline', 'infra', 'tools', 'ops'],
    validate: /docker|kubernetes|terraform/i,
    factIndex: 7,
  },
  {
    keywords: ['project', 'projects', 'portfolio', 'built', 'build', 'building', 'created', 'klear', 'thinger', 'gpt', 'carlin', 'site', 'website', 'made'],
    validate: /klear|thinger|portfolio|next\.?js|sst|gpt/i,
    factIndex: 8,
  },
  {
    keywords: ['music', 'musician', 'saxophone', 'sax', 'instrument', 'play', 'plays', 'hobby', 'hobbies', 'outside', 'besides', 'fun', 'personal', 'interest'],
    validate: /saxophone|musician|music/i,
    factIndex: 9,
  },
];

// Domain-specific words — if a question contains one of these, it's on-topic.
// Generic question words (what, who, he, does) are NOT sufficient on their own.
// "aaron" alone is NOT enough — questions like "Is aaron taking medications?"
// should hit the off-topic redirect, not go to the model.
export const DOMAIN_RE = /\b(work|worked|job|role|know|knows|skill|skills|language|languages|code|coding|built|build|project|projects|cert|certs|certification|cloud|aws|gcp|azure|docker|k8s|devops|python|rust|swift|kotlin|java|typescript|javascript|ruby|sql|bash|php|startup|cto|engineer|experience|background|career|portfolio|company|employer|sparq|forbes|artisan|nuel|ai|ml|llm|pytorch|nlp|saxophone|music|portland|oregon|infrastructure|terraform|kubernetes|deploy|programming|tools|hire)\b/i;

/**
 * Find the most relevant fact chunks for a question using keyword scoring.
 * Returns array of { fact, validate, score } sorted by relevance.
 */
export function findRelevantFacts(question, topN = 2) {
  const words = question.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const scored = FACT_INDEX.map(entry => {
    let score = 0;
    for (const word of words) {
      if (entry.keywords.includes(word)) score++;
    }
    return { fact: FACT_CHUNKS[entry.factIndex], validate: entry.validate, score };
  })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}
