import { Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';

function Resume() {
    return (
        <>
            <Helmet>
                <title>Resume | Aaron Rohrbacher | Senior Full Stack Software Engineer</title>
                <meta name="description" content="Portfolio of Aaron Rohrbacher, a fullstack software engineer based in Portland, Oregon." />
            </Helmet>

            <div>
                <a
                    href="https://aaronrohrbacher-com.s3.us-west-2.amazonaws.com/dtetravel_com_instructions.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'none' }}
                    id="pdfLink"
                    ref={el => el && el.click()}
                />
                <Navigate to={'/'} />
            </div>
        </>
    );
}

export default Resume