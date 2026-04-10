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
      <Box ref={innerRef} id={'portfolio'} py={'2rem'}>
        <h1 className="sr-only">Portfolio</h1>
        <Grid container justifyContent={'center'} sx={{ maxWidth: '100%' }}>
          {projects.map((project, index) => (
            <Grid size={{ xs: 12, md: 6 }} key={project.id ?? index}>
              <motion.div
                initial={{ opacity: 0, y: 32 }}
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
