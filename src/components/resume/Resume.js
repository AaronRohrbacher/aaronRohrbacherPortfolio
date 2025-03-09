import React, { useState } from 'react';
import { Helmet } from 'react-helmet';

function Resume() {
    // Track loading state
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    
    // PDF path - adjust to your actual path
    const pdfPath = "/resume.pdf"; // This should be in your public folder
    
    return (
        <>
            <Helmet>
                <title>Resume | Aaron Rohrbacher | Senior Full Stack Software Engineer</title>
                <meta name="description" content="Resume of Aaron Rohrbacher, a fullstack software engineer based in Portland, Oregon." />
            </Helmet>
            
            <div style={{ height: 'calc(100vh - 50px)', width: '100%', overflow: 'hidden', position: 'relative' }}>
                {!isLoaded && !hasError && (
                    <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)'
                    }}>
                        Loading PDF...
                    </div>
                )}
                
                {hasError && (
                    <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                    }}>
                        <p>Unable to load the PDF.</p>
                        <p><a href={pdfPath} download>Download the PDF instead</a></p>
                    </div>
                )}
                
                <object
                    data={pdfPath}
                    width="100%"
                    height="100%"
                    type="application/pdf"
                    style={{ display: 'block' }}
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setHasError(true)}>
                    <p>Your browser does not support PDFs. <a href={pdfPath}>Download the PDF</a> instead.</p>
                </object>
            </div>
        </>
    );
}

export default Resume;