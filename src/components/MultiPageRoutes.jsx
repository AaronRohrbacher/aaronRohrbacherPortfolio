import Home from "./home/Home";
import About from "./about/About";
import Portfolio from "./portfolio/Portfolio";
import Resume from "./resume/Resume";
import React from 'react';
import { Route, Routes } from 'react-router-dom';

export default function MultiPageRoutes() {
    return (
        <Routes>
            <Route path={'/'} element={<Home />} />
            <Route path={'/about'} element={<About />} />
            <Route path={'/portfolio'} element={<Portfolio />} />
            <Route path={'/resume'} element={<Resume />} />
        </Routes>
    )
}