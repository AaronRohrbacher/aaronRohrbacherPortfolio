import self from "../img/self.png"
import site from "../img/developer-website.png"
import klear from "../img/klear-new.png"
import noGui from "../img/no-gui.png"
import session from "../img/session.png"
import heard from "../img/heard.png"
import fanboy from "../img/fanboy.png"
import appNow from "../img/appNow.png"
import move from "../img/mock4.png"

// Accent colors must match $accent-1 and $accent-2 in src/styles/_variables.scss.
// Change them there — this file reads from CSS custom properties at runtime
// so the gradient and baseColor stay in sync automatically.
const accent1 = 'var(--accent-1)';
const accent2 = 'var(--accent-2)';

export let singlePage = false;

export const info = {
    firstName: "Aaron",
    lastName: "Rohrbacher",
    initials: "ar",
    position: "I'm a senior software & DevOps engineer building agentic AI",
    selfPortrait: self.src,
    gradient: `linear-gradient(135deg, var(--accent-1), var(--accent-2))`,
    baseColor: accent1,
    miniBio: [
        {
            emoji: '🎷',
            text: 'And a Musician'
        },
        {
            emoji: '🤖',
            text: 'Building Custom AI Models & Integrations'
        },
        {
            emoji: '💼',
            text: 'Seeking senior DevOps or AI platform roles'
        },
        {
            emoji: '🌎',
            text: 'Based in Portland, Oregon'
        },
    ],
    socials: [
        {
            link: "https://github.com/aaronrohrbacher",
            icon: "fa-brands fa-github",
            label: 'github'
        },
        {
            link: "https://linkedin.com/in/aaronrohrbacher",
            icon: "fa-brands fa-linkedin",
            label: 'linkedin'
        },
    ],
    bio: "I'm Aaron Rohrbacher — a Lead AI/ML Software Engineer and DevOps Architect with a focus on custom AI model development and integrating AI solutions into real-world products. I build and train models using PyTorch and modern LLM tooling, implement conversational AI (Amazon Lex, Polly, Transcribe, Amazon Q), and architect the cloud infrastructure (AWS, GCP, Azure) that makes it all scale. Most recently at Forbes AAC, I led emergency stabilization and a ground-up rebuild of an enterprise assistive technology platform and rebuilt all native apps (iOS, Android, macOS, Windows, Linux). At SPARQ, I led AI-driven conversational experiences, cloud migrations, and multi-cloud infrastructure for enterprise clients including a global logistics company serving 500k+ employees. AWS Certified Cloud Practitioner and Developer – Associate, with DevOps Engineer – Professional in progress. When I'm not behind a computer keyboard, I'm behind a musical one, or playing saxophone.",
    skills: {
        proficientWith: [
            'AI/ML: PyTorch, LLM implementation & fine-tuning, NLP, conversational AI',
            'Amazon AI: Lex, Polly, Transcribe, Amazon Q',
            'AWS (Lambda, ECS/EKS, EC2, API Gateway, Cognito, CloudFormation, and more)',
            'GCP (Cloud Run, Cloud Functions, Pub/Sub) & Azure',
            'JavaScript / TypeScript / Node.js',
            'Python',
            'Ruby / Ruby on Rails',
            'Java / Kotlin / Swift / Rust',
            'React / Next.js',
            'PostgreSQL, MySQL, DynamoDB, MongoDB, Redis',
            'Docker, Kubernetes, Terraform, CDK, SST',
            'iOS, Android, macOS, Windows & Linux native development',
            'Penetration testing, SOC 2, OWASP Top 10',
        ],
    },
    portfolio: [
        {
            title: "Session",
            desc: "A digital audio workstation built in pure Rust for Windows, macOS, and Linux — Beta coming soon. On Linux, it connects directly to PipeWire as a client, ending a decade of DAWs requiring JACK, QJACKctl, or jack-pipewire bridges. Closed source.",
            image: session.src,
            mockupType: 'laptop',
            url: 'session — coming soon',
            aiPowered: true,
        },
        {
            title: "Heard",
            desc: "An AI-powered DAW plugin (VST, CLAP, AU) that listens to each track, auto-detects the instrument and genre, and applies mastering/mixing tailored to that context. Works on individual tracks or on the master bus — it figures out which. Closed source, website coming soon.",
            image: heard.src,
            mockupType: 'laptop',
            url: 'heard — coming soon',
            aiPowered: true,
        },
        {
            title: "Fanboy",
            desc: "A DAW plugin (VST, CLAP, AU) for saxophone players that EQs your sound to resemble your favorite player. Presets include Joshua Redman, Joe Lovano, Michael Brecker, and Scott Hamilton, plus many others. Match against any track to learn its EQ, and transcribe full tunes (still experimental). Closed source for now, possibly going open. Website coming soon.",
            image: fanboy.src,
            mockupType: 'laptop',
            url: 'fanboy — coming soon',
            aiPowered: true,
        },
        {
            title: "AppNow",
            desc: "Uses open-source or paid LLM APIs with a constraint layer that reliably generates working CRUD applications from user input. Permissions and scope expansions landing rapidly. Repository coming soon.",
            image: appNow.src,
            mockupType: 'laptop',
        },
        {
            title: "MOVE",
            desc: "A free, open-source desktop organizer and window tiler for macOS. Freedom-respecting and focused on fast keyboard-driven layout.",
            source: "https://github.com/aaronrohrbacher/MOVE",
            image: move.src,
            mockupType: 'laptop',
        },
        {
            title: "Developer Website",
            desc: "This site. A fork of Payton Jewell's React design refactored into Next.js with SSR, SST, and AWS. Includes a fine-tuned Qwen LLM running entirely in-browser via Transformers.js (ONNX) for the floating chat agent, Amazon Connect integration for live chat / voice / video handoff, and a music streaming section backed by S3 + presigned URLs with a WaveSurfer playlist player and an admin panel for track metadata.",
            source: "https://github.com/AaronRohrbacher/aaronRohrbacherPortfolio",
            website: "https://aaronrohrbacher.com",
            image: site.src,
            mobileImage: self.src,
            mockupType: 'laptop',
            url: 'aaronrohrbacher.com',
        },
        {
            title: "Klear",
            desc: "A KDE Plasma KWin script that enables transparent windows on older hardware using the JavaScript compositor API.",
            source: "https://github.com/AaronRohrbacher/klear_kwin",
            image: klear.src,
            mockupType: 'laptop',
        },
        {
            title: "Thinger",
            desc: "A Python script that isolates every use of a given word or phrase in a video and compiles them into a new clip. As the kids say, it's keen!",
            source: "https://github.com/AaronRohrbacher/thinger",
            image: noGui.src,
            mockupType: 'laptop',
        },
        {
            title: "ai",
            desc: "A PyTorch GPT-2 implementation trained on George Carlin transcriptions. Responds to prompts in his style. WARNING: utterly vile.",
            source: "https://github.com/AaronRohrbacher/ai",
            image: noGui.src,
            mockupType: 'laptop',
        },
        {
            title: "Nuel API",
            desc: "Provisions LAMP stacks and cloud resources to client accounts, automates billing and signup, and delivers a blazing-fast PHP experience.",
            source: "https://github.com/AaronRohrbacher/nuel-api",
            image: noGui.src,
            mockupType: 'laptop',
        }
    ]
}
