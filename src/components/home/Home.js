import React from 'react';
import Style from './Home.module.scss';
import classNames from 'classnames';
import EmojiBullet from "./EmojiBullet";
import SocialIcon from "./SocialIcon";
import { Box } from "@mui/material";
import { info } from "../../info/Info";
import Slider from './Slider';
import { Helmet } from 'react-helmet';

export default function Home({ innerRef }) {

   const openChatWidget = () => {
      document.querySelector('#amazon-connect-open-widget-button').click()
   }

   return (
      <>
         <Helmet>
            <title>Aaron Rohrbacher | Senior Full Stack Software Engineer</title>
            <meta name="description" content="Portfolio of Aaron Rohrbacher, a fullstack software engineer based in Portland, Oregon." />
         </Helmet>
         <Box ref={innerRef} component={'main'} display={'flex'} flexDirection={{ xs: 'column', md: 'row' }} alignItems={'center'}
            justifyContent={'center'} minHeight={'calc(100vh - 175px)'} sx={{ maxWidth: '100%', padding: { xs: '1rem', md: '2rem' } }}>
            <Box className={classNames(Style.avatar, Style.shadowed)} alt={'image of developer'} style={{ background: info.gradient }} width={{ xs: '35vh', md: '40vh' }}
               height={{ xs: '35vh', md: '40vh' }}
               borderRadius={'50%'} mb={{ xs: '1rem', sm: 0 }} mr={{ xs: 0, md: '2rem' }}>
               <Slider></Slider>
            </Box>
            <Box>
               <h1>Hi, I'm <span style={{ background: info.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{info.firstName}</span><span className={Style.hand}>🤚</span>
               </h1>
               <h2>I'm {info.position}.</h2>
               <Box component={'ul'} p={'0.8rem'}>
                  {info.miniBio.map((bio, index) => (
                     <EmojiBullet key={index} emoji={bio.emoji} text={bio.text} link={bio.link} />
                  ))}
               </Box>
               <Box display={'flex'} justifyContent={'center'}>
                  <button onClick={openChatWidget}><strong>Let's Chat!</strong></button>
               </Box>
               <Box display={'flex'} gap={'1.5rem'} justifyContent={'center'} fontSize={{ xs: '2rem', md: '2.5rem' }}>
                  {info.socials.map((social, index) => (
                     <SocialIcon key={index} link={social.link} icon={social.icon} label={social.label} />
                  ))}
               </Box>
            </Box>
         </Box>
      </>
   )
}