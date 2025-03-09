import React from 'react';
import Style from './About.module.scss';
import Terminal from "./Terminal";
import { Box } from "@mui/material";
import { info } from "../../info/Info";
import { Helmet } from 'react-helmet';


export default function About({ innerRef }) {
    const firstName = info.firstName.toLowerCase()

    function aboutMeText() {
        return <>
            <p align={"center"}>
                Please see my <a href="/resume">resume</a> for a detailed account! Thank you.
            </p>

            <p><span style={{ color: info.baseColor }}>{firstName}{info.lastName.toLowerCase()} $</span> cat
                about{firstName} </p>
            <p>
                {info.bio}
            </p>
        </>;
    }

    function skillsText() {
        return <>
            <p align={"center"}>
                Please see my <a href="/resume">resume</a> for a detailed account! Thank you.
            </p>
            <p><span style={{ color: info.baseColor }}>{firstName}{info.lastName.toLowerCase()} $</span> cd skills/tools
            </p>
            <p><span style={{ color: info.baseColor }}>skills/tools <span
                className={Style.green}>(main)</span> $</span> ls</p>
            <p style={{ color: info.baseColor }}> Proficient With</p>
            <ul className={Style.skills}>
                {info.skills.proficientWith.map((proficiency, index) => <li key={index}>{proficiency}</li>)}
            </ul>
        </>;
    }

    return (
        <>
            <Helmet>
                <title>About | Aaron Rohrbacher | Senior Full Stack Software Engineer</title>
                <meta name="description" content="Portfolio of Aaron Rohrbacher, a fullstack software engineer based in Portland, Oregon." />
            </Helmet>

            <Box ref={innerRef} display={'flex'} flexDirection={'column'} alignItems={'center'} mt={'3rem'} id={'about'}>
                <Terminal text={aboutMeText()} />
                <Terminal text={skillsText()} />
            </Box>
        </>
    )
}