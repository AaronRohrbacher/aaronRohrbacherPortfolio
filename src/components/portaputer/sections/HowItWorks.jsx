'use client';

import Link from 'next/link';
import Style from '../PortaputerPage.module.scss';
import { usePortaputerHref } from '@/lib/portaputerLinks';

const steps = [
  {
    num: '1',
    title: 'Capture',
    desc: 'Run the installer on your Windows PC. PortaPuter safely images your live system using VSS snapshots — no downtime, no reboots.',
  },
  {
    num: '2',
    title: 'Package',
    desc: 'Your OS, apps, files, and a lightweight VM runtime are bundled into a single portable folder on your desktop.',
  },
  {
    num: '3',
    title: 'Launch',
    desc: 'Copy the folder to any Windows PC, double-click Install.exe, then run the shortcut. Your full desktop opens in a window.',
  },
];

export default function HowItWorks({ showInstructionsLink = false }) {
  const portaputerHref = usePortaputerHref();
  return (
    <section className={Style.section}>
      <h2 className={Style.sectionTitle}>How it works</h2>
      <div className={Style.stepsGrid}>
        {steps.map((step) => (
          <div key={step.num} className={Style.step}>
            <span className={Style.stepNum}>{step.num}</span>
            <h3 className={Style.stepTitle}>{step.title}</h3>
            <p className={Style.stepDesc}>{step.desc}</p>
          </div>
        ))}
      </div>
      {showInstructionsLink && (
        <div className={Style.sectionCta}>
          <Link href={portaputerHref('/installation')} className={Style.sectionCtaLink}>
            Read the full installation and use guide
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      )}
    </section>
  );
}
