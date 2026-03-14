import self from "../img/self.png"
import site from "../img/site.png"
import klear from "../img/klear.png"
import thinger from "../img/thinger.png"

export let colors = ["rgb(0,255,164)", "rgb(166,104,255)"];
export let singlePage = false;

export const info = {
    firstName: "Aaron",
    lastName: "Rohrbacher",
    initials: "ar",
    position: "a Senior Full Stack Cloud Engineer",
    selfPortrait: self,
    gradient: `-webkit-linear-gradient(135deg, ${colors})`,
    baseColor: colors[0],
    miniBio: [
        {
            emoji: '🎷',
            text: 'and a musician'
        },
        {
            emoji: '🌎',
            text: 'based in Portland, Oregon'
        },
        {
            emoji: "💼",
            text: "Technical Lead and Senior Software Engineer"
        },
    ],
    socials: [
        {
            link: "https://github.com/aaronrohrbacher",
            icon: "fa fa-github",
            label: 'github'
        },
        {
            link: "https://linkedin.com/in/aaronrohrbacher",
            icon: "fa fa-linkedin",
            label: 'linkedin'
        },
    ],
    bio: "Hi there! My name is Aaron Rohrbacher, and I'm a senior-level full stack software engineer. I'm currently working for a company named Sparq, where I drive our clients' most critical infrastructure decision making. Using the aforementioned decisions, I architect comprehensive cloud infrastructure, and lead my teams as a player-coach in building web apps that our clients fall in love with. I thrive on doing the right thing, and those who do the same! When I'm not behind a computer keyboard, I'm behind a musical one, or playing my saxophone.",
    skills:
        {
            proficientWith: ['AWS, Azure, and Google Cloud Platform', 'Python', 'NodeJS', 'Java', 'Ruby, Ruby on Rails', 'SQL (PostgreSQL, MySQL and derivatives)', 'NoSql Databases (DynamoDB, Mongo)', 'Bash', 'Powershell', 'And so much more...' ],
        }
    ,
    portfolio: [ 
        {
            title: "Developer Website",
            desc: "A fork of Payton Jewell's well-done React design, used to refactor for this website!",
            source: "https://github.com/AaronRohrbacher/aaronRohrbacherPortfolio",
            image: site
        },
        {
            title: "Klear",
            desc: "A simple implementation of KDE Plasma's JavaScript API for Kwin, allowing for transparent windows on older hardware.",
            source: "https://github.com/AaronRohrbacher/klear_kwin",
            image: klear
        },
        {
            title: "Thinger",
            desc: "A Python script that isolates the use of a given word or phrase in a video, and compiles all uses of that word to a new video. As the kids say, it's keen!",
            source: "https://github.com/AaronRohrbacher/thinger",
            image: thinger
        },
        {
            title: "ai",
            desc: "A PyTorch implementation of the GPT-2 LLM, trained to respond to prompts based on transcriptions of George Carlin performances. WARNING: it's utterly vile!",
            source: "https://github.com/AaronRohrbacher/ai",
            image: thinger
        },
        {
            title: "Nuel API",
            desc: "A small example from proprietary software I wrote that provisions LAMP stacks and other resources to client accounts, automates billing and signup, and provides a HUGELY fast PHP experience.",
            source: "https://github.com/AaronRohrbacher/nuel-api",
            image: thinger
        }
    ]
}