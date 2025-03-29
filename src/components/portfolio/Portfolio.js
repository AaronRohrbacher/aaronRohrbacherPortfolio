import React from 'react';
import PortfolioBlock from "./PortfolioBlock";
import { Box, Grid } from "@mui/material";
import { info } from "../../info/Info";
import { Helmet } from 'react-helmet';

export default function Portfolio({ innerRef }) {
    return (
        <>
            <Helmet>
                <title>Aaron Rohrbacher | Portfolio</title>
                <meta name="description" content="Aaron Rohrbacher's portfolio of personal software projects." />
            </Helmet>
            <Box id={'portfolio'}>
                <Grid container display={'flex'} justifyContent={'center'} sx={{ maxWidth: '100%' }}>
                    {info.portfolio.map((project, index) => (
                        <Grid item xs={12} md={6} key={index}>
                            <PortfolioBlock image={project.image} desc={project.desc} source={project.source} title={project.title} />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        </>
    );
};