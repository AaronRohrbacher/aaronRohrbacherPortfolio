'use client';

import React, { useState, useEffect } from 'react';
import PortfolioBlock from './PortfolioBlock';
import { Box, Grid } from '@mui/material';
import { motion, MotionConfig } from 'framer-motion';
import { info } from '@/info/Info';

const STORAGE_KEY = 'portfolio_items';

export default function Portfolio({ innerRef }) {
  const [projects, setProjects] = useState(info.portfolio);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setProjects(JSON.parse(stored)); } catch {}
    }
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <Box ref={innerRef} id={'portfolio'} sx={{ py: '2rem' }}>
        <h1 className="sr-only">Portfolio</h1>
        <Box
          sx={{
            maxWidth: '720px',
            margin: '0 auto 2.5rem',
            padding: '0 1rem',
            textAlign: 'center',
            lineHeight: 1.6,
            opacity: 0.85,
          }}
        >
          Here are a few of my personal projects. In an industry that requires a
          constant state of learning, I maintain a standard of practice around
          language-agnostic problem solving. I choose the language for the
          application, not the reverse.
        </Box>
        <Grid container sx={{ justifyContent: 'center', maxWidth: '100%' }}>
          {projects.map((project, index) => (
            <Grid size={{ xs: 12, md: 6 }} key={project.id ?? index}>
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: (index % 2) * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                <PortfolioBlock project={project} />
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </Box>
    </MotionConfig>
  );
}

Portfolio.displayName = 'Portfolio';
