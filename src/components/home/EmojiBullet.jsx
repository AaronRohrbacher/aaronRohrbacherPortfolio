import React from 'react';
import {Box} from "@mui/material";

function EmojiBullet(props) {
    const {emoji, text, linkText, link} = props;
    return (
        <Box component={'li'} fontSize={'1rem'} lineHeight={1.5} style={{cursor: 'default'}}>
            <Box component={'span'} aria-label="cheese"
                 role="img"
                 mr={{xs: '0.5rem', md: '1rem'}} fontSize={'1.5rem'}>{emoji}</Box>
            {text}
            {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-1)', textDecoration: 'underline'}}>{linkText}</a>}
        </Box>
    );
}

export default EmojiBullet;