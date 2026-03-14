import React from 'react';
import './App.module.scss';
import BaseLayout from "./components/BaseLayout";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider, Helmet } from 'react-helmet-async';

function App() {
   return (
      <HelmetProvider>
         <BrowserRouter>
            <Helmet>
               <title>Aaron Rohrbacher | Senior Full Stack Software Engineer</title>
               <meta name="description" content="Aaron Rohrbacher is a fullstack software engineer based in Portland, Oregon. In his spare time, he plays saxophone in various settings, and is learning instrument repair." />
            </Helmet>
            <BaseLayout />
         </BrowserRouter>
      </HelmetProvider>
   );
}


export default App;
