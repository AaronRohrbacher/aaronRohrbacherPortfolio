import Style from './PortaputerPage.module.scss';
import Hero from './sections/Hero';
import HowItWorks from './sections/HowItWorks';
import OpenSource from './sections/OpenSource';

export default function PortaputerPage() {
  return (
    <main className={Style.main}>
      <Hero />
      <HowItWorks showInstructionsLink />
      <OpenSource />
    </main>
  );
}
