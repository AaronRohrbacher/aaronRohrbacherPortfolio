import { useEffect, useRef } from 'react';
import aaron_rohrbacher from './aaron_rohrbacher.pdf';

function Resume() {
  const containerRef = useRef(null);
  
  useEffect(() => {
    const adjustHeight = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${window.innerHeight}px`;
      }
    };
    
    adjustHeight();
    
    window.addEventListener('resize', adjustHeight);
    
    return () => {
      window.removeEventListener('resize', adjustHeight);
    };
  }, []);
  
  return (
    <div ref={containerRef} style={{ overflow: 'hidden' }}>
      <object data={aaron_rohrbacher} type="application/pdf" width="100%" height="100%" style={{ display: 'block' }} />
    </div>
  );
}

export default Resume;