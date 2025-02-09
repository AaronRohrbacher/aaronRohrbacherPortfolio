import { Navigate } from 'react-router-dom';

function Resume() {
    return (
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
    );
}

export default Resume