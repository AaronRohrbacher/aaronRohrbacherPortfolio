'use client';

import React from 'react';
import Style from './About.module.scss';
import { motion, MotionConfig } from 'framer-motion';
import { info } from '@/info/Info';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

const PHILOSOPHY = [
  'Language and framework agnosticism. Tools get picked for the problem, not the other way around — and that goes for AI too.',
  'The Open-Closed Principle is at the heart of most everything I build. Extend, don\'t gut.',
  'Self-documenting code and the Principle of Least Astonishment. Magic isn\'t always magic for the next folks.',
  'RFC-based decision-making. I\'ve laid down the law on architecture and tooling, but I\'ve learned more from my colleagues than from any course or book. Encourage discussion — even disagreement. That\'s how we grow as technologists.',
];

const SKILL_GROUPS = [
  { label: 'AI & Machine Learning', color: 'var(--accent-1)', skills: ['PyTorch', 'LLM Fine-tuning', 'NLP', 'Conversational AI', 'Amazon Lex / Polly / Transcribe', 'Amazon Q'] },
  { label: 'Cloud', color: 'var(--accent-2)', skills: ['AWS', 'GCP', 'Azure', 'Lambda', 'ECS / EKS', 'CloudFormation', 'Terraform', 'CDK', 'SST'] },
  { label: 'Languages', color: 'var(--purple)', skills: ['JavaScript / TypeScript', 'Python', 'Ruby', 'Java / Kotlin', 'Swift', 'Rust', 'SQL', 'PHP'] },
  { label: 'Frontend & Frameworks', color: 'var(--accent-1)', skills: ['React', 'Next.js', 'Ruby on Rails', 'Node.js / Express', 'Vue.js', 'Angular', 'Tailwind CSS', 'SCSS'] },
  { label: 'Mobile & Desktop', color: 'var(--accent-2)', skills: ['iOS (Swift / SwiftUI)', 'Android (Java / Kotlin)', 'macOS (Swift / AppKit)', 'Windows & Linux (Qt / Rust)'] },
  { label: 'DevOps & Security', color: 'var(--purple)', skills: ['Docker', 'Kubernetes', 'GitHub Actions', 'GitLab CI', 'Penetration Testing', 'OWASP Top 10', 'SOC 2'] },
];

export default function About({ innerRef }) {
  return (
    <MotionConfig reducedMotion="user">
      <div ref={innerRef} className={Style.page} id="about">

        {/* ── Two-column main layout ── */}
        <div className={Style.grid}>

          {/* Left: bio + philosophy */}
          <div className={Style.left}>
            <motion.p className={Style.eyebrow} variants={fadeUp} custom={0} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              About
            </motion.p>
            <motion.h1 className={Style.heading} variants={fadeUp} custom={1} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              {info.firstName} {info.lastName}
            </motion.h1>
            <motion.p className={Style.role} variants={fadeUp} custom={2} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              {info.position}
            </motion.p>

            <motion.p className={Style.bioParagraph} variants={fadeUp} custom={3} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              {info.bio}
            </motion.p>

            <motion.div className={Style.philosophy} variants={fadeUp} custom={4} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              <p className={Style.philosophyLabel}>Engineering philosophy</p>
              {PHILOSOPHY.map((item, i) => (
                <div key={i} className={Style.philosophyItem}>
                  <span className={Style.philosophyMark} style={{ color: i % 2 === 0 ? 'var(--accent-1)' : 'var(--accent-2)' }}>▸</span>
                  {item}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: bento cards */}
          <motion.div className={Style.bento} variants={fadeUp} custom={2} initial="hidden" whileInView="visible" viewport={{ once: true }}>

            {/* Currently */}
            <div className={`${Style.card} ${Style.cardWide}`}>
              <p className={Style.cardLabel}>Currently</p>
              <p className={Style.cardValue}>
                Open to new opportunities — Lead AI/ML Software Engineer &amp; DevOps Architect, available immediately
              </p>
            </div>

            {/* Location */}
            <div className={Style.card}>
              <p className={Style.cardLabel}>📍 Based in</p>
              <p className={Style.cardValue}>Portland, Oregon</p>
            </div>

            {/* Music */}
            <div className={Style.card}>
              <p className={Style.cardLabel}>🎷 Also</p>
              <p className={Style.cardValue}>Musician &amp; saxophone player</p>
            </div>

            {/* Certifications */}
            <div className={`${Style.card} ${Style.cardWide}`}>
              <p className={Style.cardLabel}>Certifications</p>
              <div className={Style.certList}>
                <span className={Style.cert} style={{ color: 'var(--accent-1)' }}>✓ AWS Cloud Practitioner</span>
                <span className={Style.cert} style={{ color: 'var(--accent-1)' }}>✓ AWS Developer – Associate</span>
                <span className={Style.cert} style={{ opacity: 0.55 }}>⏳ AWS DevOps Engineer – Professional</span>
              </div>
            </div>

            {/* Terminal easter egg */}
            <div className={`${Style.card} ${Style.cardWide} ${Style.terminalCard}`}>
              <div className={Style.terminalDots}>
                <span style={{ background: 'var(--red)' }} />
                <span style={{ background: 'var(--yellow)' }} />
                <span style={{ background: 'var(--green)' }} />
              </div>
              <div className={Style.terminalBody}>
                <p><span className={Style.terminalPrompt}>~$</span> whoami</p>
                <p className={Style.terminalOut}>lead ai engineer · devops architect · musician</p>
                <p><span className={Style.terminalPrompt}>~$</span> uptime</p>
                <p className={Style.terminalOut}>7+ yrs in cloud &amp; software engineering</p>
                <p><span className={Style.terminalPrompt}>~$</span> <span className={Style.terminalCursor}>▌</span></p>
              </div>
            </div>

          </motion.div>
        </div>

        {/* ── Skills ── */}
        <div className={Style.skillsSection}>
          <motion.p
            className={Style.skillsHeading}
            variants={fadeUp} custom={0} initial="hidden"
            whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          >
            Skills &amp; Tools
          </motion.p>
          <div className={Style.skillGrid}>
            {SKILL_GROUPS.map((group, i) => (
              <motion.div
                key={group.label}
                className={Style.skillGroup}
                variants={fadeUp} custom={i} initial="hidden"
                whileInView="visible" viewport={{ once: true, margin: '-60px' }}
              >
                <p className={Style.skillGroupLabel} style={{ color: group.color }}>{group.label}</p>
                <div className={Style.skillTags}>
                  {group.skills.map(skill => (
                    <span key={skill} className={Style.skillTag}>{skill}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </MotionConfig>
  );
}

About.displayName = 'About';
