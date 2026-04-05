'use client';

import React, { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence, MotionConfig } from 'framer-motion';
import Style from './Resume.module.scss';

// ─── Data ─────────────────────────────────────────────────────────────────────

const EXPERIENCE = [
  {
    company: 'Forbes AAC',
    title: 'Lead Software Development Engineer',
    period: 'Aug 2025',
    location: 'Mansfield, OH (Remote)',
    color: 'var(--accent-2)',
    bullets: [
      'Stabilized emergency-ridden deprecations, mitigating imminent risk of platform and data loss through programming and soft skills.',
      'Stabilized a Ruby 2.6 and Ember 3.0 application (both past EOL), creating tools to convert deprecated Ember code into editable JavaScript — preserving years of Speech Language Pathologist refinements.',
      'Negotiated with Heroku and upgraded infrastructure to prevent complete loss of the application, providing a timely outcome that left everything operational with satisfied stakeholders.',
      'Prevented loss of the Android application by bringing it to current standards and ensuring continued functionality for critical communication needs.',
      'Upgraded iOS app to prevent crashing and added compatibility with latest iOS versions, ensuring uninterrupted service for users who depend on it for daily communication.',
      'Architected a complete infrastructure rebuild on Next.js — injecting compiled legacy Ember JS for continuity — while medical professionals continued refining decade-old features without interruption.',
      'Fully rebuilt cross-platform apps in native code: iOS (Swift), Android (Java/Kotlin), macOS (Swift with native navigation), Windows & Linux (Qt on Rust), replacing deprecated Cordova.',
      'Redesigned content sync from one-asset-at-a-time to compressed, licensed package delivery — saving thousands monthly in data transfer costs and enabling better offline use for AAC users.',
    ],
  },
  {
    company: 'SPARQ',
    title: 'Technical Lead & Senior Software Engineer',
    period: 'Aug 2022 – Feb 2025',
    location: 'Atlanta, GA (Remote)',
    color: 'var(--purple)',
    bullets: [
      'Consulted for enterprise clients across AAC, logistics, and payroll — delivering technical leadership, architecture, and implementation expertise.',
      'Inherited a codebase whose sole developer went AWOL; documented existing API and developed a comprehensive infrastructure migration plan.',
      'Migrated application from Heroku to AWS with zero downtime, upgraded severely deprecated dependencies, and relaunched with improved security.',
      'Served as lead system architect building microservices and APIs on AWS Lambda + Node.js with third-party services — achieving significant cloud infrastructure cost savings.',
      'Completed phase-one production deployment of a payroll system overhaul serving 500k+ employees for a global logistics leader.',
      'Modernized internal API processes for a new payroll vendor using GCP Cloud Run functions (Python, Java, Node.js), resulting in substantial cost savings.',
      'Guided offshore development teams on ADO CI/CD best practices with GCP deployment and local environment virtualization.',
      'Mentored junior programmers and introduced modern cloud computing concepts to offshore development teams and stakeholder leadership.',
      'Led in-house team to create AI-based conversational experiences for internal client websites.',
      'Served on security and risk management teams — penetration testing and risk assessment.',
    ],
  },
  {
    company: 'Nuel Cloud Computing LLC',
    title: 'Proprietor, System Architect & Engineer',
    period: 'Aug 2020 – Feb 2024',
    location: 'Portland, OR',
    color: 'var(--accent-1)',
    bullets: [
      'Architected and developed a proprietary AWS solution to provision containerized LAMP stacks (PHP) via ECS and EKS for WordPress designers and PHP developers. Built in Node.js, Express, Python, Serverless Framework, AWS Lambda, API Gateway, ECS/EKS, and Cognito.',
      'Architected and designed customer dashboard for automated signup, migration from legacy systems, customized stack preferences, user profiles, and PHP/WordPress plugin management. Frontend in React; backend in Node.js, PHP, and Bash.',
      'Delivered the fastest WordPress/PHP installation on the market — integrated backend caching and CloudFront CDN optimized for WordPress/PHP.',
      'Provided security and vulnerability assessments, automating security best practices throughout the system with nearly zero downtime.',
    ],
  },
  {
    company: 'Nordic Semiconductor',
    title: 'Software Engineer II',
    period: 'Feb 2022 – Mar 2022',
    location: 'Portland, OR',
    color: 'var(--accent-2)',
    bullets: [
      'Developed test automation tools and scripts for AWS in Node.js using React, Jest, Cypress, Linux, and Istanbul.',
      'Built Nordic\'s first "thingy lab" — enabling IoT device experiments on a proprietary dashboard in novel hardware combinations.',
    ],
  },
  {
    company: 'Fiduciary Benchmarks',
    title: 'Junior Software Development Engineer',
    period: 'Jul 2018 – Aug 2021',
    location: 'Lake Oswego, OR',
    color: 'var(--purple)',
    bullets: [
      'Designed and maintained automated E2E test suite using JavaScript and Cypress.',
      'Designed and maintained sophisticated manual regression test suite using Cucumber and BDD best practices.',
      'Analyzed, debugged, and communicated issues reported by data operations and service teams.',
      'Reliably communicated test results to Development Manager and agile development team.',
      'Implemented WalkMe digital adoption platform — step-by-step in-app guidance ensuring client success.',
    ],
  },
  {
    company: 'Planet Argon',
    title: 'Web Development Intern',
    period: 'Jan 2018 – Feb 2018',
    location: 'Portland, OR',
    color: 'var(--accent-1)',
    bullets: [
      'Client projects for NIKE, Aloha Foods, and PAC Global — test suite enhancements, sitemaps, integration, and advanced Spree eCommerce integration including custom roles.',
    ],
  },
];

const SKILL_GROUPS = [
  {
    label: 'AI & Machine Learning',
    color: 'var(--accent-1)',
    skills: ['PyTorch', 'LLM Implementation & Fine-tuning', 'NLP', 'Conversational AI', 'Amazon Lex', 'Amazon Polly', 'Amazon Transcribe', 'Amazon Q'],
  },
  {
    label: 'Languages',
    color: 'var(--accent-2)',
    skills: ['JavaScript / TypeScript / Node.js', 'Python', 'Ruby', 'Java / Kotlin', 'Swift', 'Rust', 'Bash', 'PowerShell', 'PHP', 'SQL'],
  },
  {
    label: 'Frameworks & Libraries',
    color: 'var(--purple)',
    skills: ['Next.js', 'React', 'Ruby on Rails', 'Express', 'Vue.js', 'Angular', 'Ember.js', 'SST (Serverless Stack)', 'Serverless Framework', 'Tailwind CSS', 'SCSS / SASS'],
  },
  {
    label: 'Cloud — AWS',
    color: 'var(--accent-1)',
    skills: ['Lambda', 'ECS / EKS', 'EC2', 'API Gateway', 'CloudFormation', 'VPC', 'Route53', 'IAM', 'Cognito', 'S3', 'CloudFront', 'RDS', 'DynamoDB', 'SES / SNS / SQS', 'CloudWatch', 'Cost Management', 'Systems Manager'],
  },
  {
    label: 'Cloud — GCP & Azure',
    color: 'var(--accent-2)',
    skills: ['Cloud Run', 'Cloud Functions', 'Compute Engine', 'Cloud SQL', 'Pub/Sub', 'Azure DevOps', 'Azure equivalents'],
  },
  {
    label: 'Infrastructure & DevOps',
    color: 'var(--purple)',
    skills: ['Docker', 'Kubernetes', 'Terraform', 'AWS CDK', 'CloudFormation', 'GitHub Actions', 'GitLab CI', 'Azure DevOps', 'Jenkins', 'Microservices', 'Serverless Architecture'],
  },
  {
    label: 'Mobile & Desktop',
    color: 'var(--accent-1)',
    skills: ['iOS (Swift / SwiftUI)', 'Android (Java / Kotlin)', 'macOS (Swift / AppKit)', 'Windows & Linux (Qt / Rust)', 'React Native', 'Cordova'],
  },
  {
    label: 'Databases',
    color: 'var(--accent-2)',
    skills: ['PostgreSQL', 'MySQL / MariaDB', 'MongoDB', 'DynamoDB', 'Redis', 'ElastiCache'],
  },
  {
    label: 'Testing & QA',
    color: 'var(--purple)',
    skills: ['Cypress', 'Jest', 'Jasmine', 'Mocha', 'Selenium', 'Puppeteer', 'TestNG', 'Rest-assured', 'BDD / Cucumber'],
  },
  {
    label: 'Security & Compliance',
    color: 'var(--accent-1)',
    skills: ['Penetration Testing', 'Burp Suite', 'OWASP Top 10', 'SOC 2 Preparation', 'IAM & Access Control', 'Encryption & Data Protection'],
  },
  {
    label: 'Frontend & Design',
    color: 'var(--accent-2)',
    skills: ['HTML5', 'CSS3', 'Bootstrap', 'Responsive Design', 'Accessibility (WCAG)', 'UI/UX Optimization', 'Adobe Creative Suite', 'GIMP'],
  },
  {
    label: 'Additional Technologies',
    color: 'var(--purple)',
    skills: ['WordPress / PHP', 'VoIP / SIP Trunking', 'WebRTC', 'Real-time Communication', 'CDN & Caching (Varnish, Redis)', 'Linux Admin (Ubuntu, CentOS, Debian, Arch)', 'Agile / Scrum'],
  },
];

const TABS = ['Timeline', 'Skills', 'About', 'Ask AI'];

// ─── Shared animation variants ────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35 } },
};

// ─── Timeline entry ───────────────────────────────────────────────────────────

function TimelineEntry({ job, index, isLast }) {
  const [open, setOpen] = useState(index === 0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      className={Style.entry}
      variants={fadeUp}
      custom={index}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
    >
      <div className={Style.spine}>
        <motion.div
          className={Style.dot}
          style={{ background: job.color }}
          initial={{ scale: 0 }}
          animate={inView ? { scale: 1 } : { scale: 0 }}
          transition={{ delay: index * 0.07 + 0.15, type: 'spring', stiffness: 300 }}
        />
        {!isLast && <div className={Style.line} />}
      </div>

      <div className={Style.entryContent}>
        <button className={Style.entryHeader} onClick={() => setOpen(o => !o)}>
          <div>
            <p className={Style.entryCompany} style={{ color: job.color }}>{job.company}</p>
            <h3 className={Style.entryTitle}>{job.title}</h3>
            <p className={Style.entryMeta}>{job.period} · {job.location}</p>
          </div>
          <motion.span
            className={Style.chevron}
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25 }}
          >▾</motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              className={Style.bullets}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {job.bullets.map((b, i) => (
                <motion.li key={i} variants={fadeUp} custom={i} initial="hidden" animate="visible">
                  <span className={Style.bulletMark} style={{ color: job.color }}>▸</span>
                  {b}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Skill Groups ─────────────────────────────────────────────────────────────

function SkillGroups() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className={Style.skillGroups}>
      {SKILL_GROUPS.map((group, i) => (
        <motion.div
          key={group.label}
          className={Style.skillGroup}
          variants={fadeUp}
          custom={i}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <p className={Style.skillGroupLabel} style={{ color: group.color }}>{group.label}</p>
          <div className={Style.skillTags}>
            {group.skills.map((skill) => (
              <span key={skill} className={Style.skillTag}>{skill}</span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── AI Chat panel — opens the site-wide AI agent ─────────────────────────────

function AskAI() {
  const openChat = () => {
    window.dispatchEvent(new CustomEvent('open-chat-agent'));
  };

  return (
    <motion.div className={Style.aiPanel} variants={fadeUp} custom={0} initial="hidden" animate="visible">
      <div className={Style.aiIntro}>
        <div className={Style.aiIcon}><i className="fa-solid fa-microchip-ai" /></div>
        <p>Ask my AI assistant anything — experience, skills, projects, or just curiosity. You can also leave a message, request my contact info, or connect by voice or video.</p>
        <p className={Style.aiDisclaimer}>
          <i className="fa-solid fa-circle-info" /> AI runs entirely in your browser via Transformers.js.
        </p>
      </div>
      <button className={Style.aiOpenBtn} onClick={openChat}>
        <i className="fa-solid fa-comments" /> Open AI Chat
      </button>
      <p className={Style.firstLoad}>Or use the <i className="fa-solid fa-comments" /> button in the bottom-right corner.</p>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Resume({ innerRef }) {
  const [tab, setTab] = useState('Timeline');

  return (
    <MotionConfig reducedMotion="user">
    <div ref={innerRef} className={Style.page}>

      <motion.header
        className={Style.header}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className={Style.eyebrow}>Resume</p>
        <h1 className={Style.name}>Aaron Rohrbacher</h1>
        <p className={Style.role}>Lead AI/ML Software Engineer &amp; DevOps Architect</p>
        <p className={Style.location}>
          <i className="fa-solid fa-location-dot" /> Portland, Oregon &nbsp;·&nbsp; Open to senior / lead roles
        </p>
        <div className={Style.contacts}>
          <a href="https://github.com/aaronrohrbacher" target="_blank" rel="noopener noreferrer" className={Style.contactLink}>
            <i className="fa-brands fa-github" /> GitHub
          </a>
          <a href="https://linkedin.com/in/aaronrohrbacher" target="_blank" rel="noopener noreferrer" className={Style.contactLink}>
            <i className="fa-brands fa-linkedin" /> LinkedIn
          </a>
          <a href="/Aaron_Rohrbacher_Resume.pdf" download className={Style.downloadBtn}>
            <i className="fa-solid fa-download" /> Download PDF
          </a>
        </div>
      </motion.header>

      <div className={Style.tabs}>
        {TABS.map(t => (
          <button
            key={t}
            className={[Style.tab, tab === t ? Style.tabActive : ''].join(' ')}
            onClick={() => setTab(t)}
          >
            {t}
            {tab === t && (
              <motion.div className={Style.tabUnderline} layoutId="tab-underline" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className={Style.panel}
        >
          {tab === 'Timeline' && (
            <div className={Style.timeline}>
              {EXPERIENCE.map((job, i) => (
                <TimelineEntry key={job.company} job={job} index={i} isLast={i === EXPERIENCE.length - 1} />
              ))}
            </div>
          )}

          {tab === 'Skills' && <SkillGroups />}

          {tab === 'About' && (
            <motion.div className={Style.about} variants={fadeUp} custom={0} initial="hidden" animate="visible">
              <p>I&apos;m a Lead AI/ML Software Engineer &amp; DevOps Architect with language-agnostic proficiency in programming and DevOps, and deep expertise in fiduciary finance, HR, payroll, and logistics. I deliver creative, effective, and timely solutions across AWS, GCP, and Azure.</p>
              <p>Most recently at Forbes AAC, I led emergency stabilization and a ground-up enterprise rebuild of an assistive technology platform, including full rewrites of all native apps (iOS, Android, macOS, Windows, Linux). At SPARQ, I drove AI-powered conversational experiences and infrastructure for enterprise clients including a payroll overhaul serving 500k+ employees.</p>
              <p>AWS Certified Cloud Practitioner and Certified Developer – Associate. AWS DevOps Engineer – Professional in progress. Outside of engineering, I play saxophone and am learning instrument repair.</p>
              <motion.div className={Style.cta} variants={fadeUp} custom={3} initial="hidden" animate="visible">
                <a href="/contact" className={Style.ctaBtn}>
                  <i className="fa-solid fa-envelope" /> Get in touch
                </a>
              </motion.div>
            </motion.div>
          )}

          {tab === 'Ask AI' && <AskAI />}

        </motion.div>
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

Resume.displayName = 'Resume';
