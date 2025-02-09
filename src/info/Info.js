import self from "../img/self.png"
import site from "../img/site.png"
import klear from "../img/klear.png"
import thinger from "../img/thinger.png"
import mock4 from "../img/mock4.png"
import mock5 from "../img/mock5.png"

/* Hi there! Thanks for checking out my portfolio template. Be sure to read the comments to get a better understanding of
how to make this template work best for you! */

export let colors = ["rgb(0,255,164)", "rgb(166,104,255)"];
/*
I highly recommend using a gradient generator like https://gradientgenerator.paytonpierce.dev/ to generate a pair of colors that you like.
These colors will be used to style your name on the homepage, the background of your picture, and some other accents throughout
the site.
 */

/* 
This variable will change the layout of the website from multipage to single, scrollable page
*/
export let singlePage = false;

/*
So let's get started! Some of the info below is pretty self-explanatory, like 'firstName' and 'bio'. I'll try to explain anything
that might not be obvious right off the bat :) I recommend looking at the template example live using "npm start" to get an idea
of what each of the values mean.
 */

export const info = {
    firstName: "Aaron",
    lastName: "Rohrbacher",
    initials: "ar", // the example uses first and last, but feel free to use three or more if you like.
    position: "a Senior Full Stack Cloud Engineer",
    selfPortrait: self, // don't change this unless you want to name your self-portrait in the "img" folder something else!
    gradient: `-webkit-linear-gradient(135deg, ${colors})`, // don't change this either
    baseColor: colors[0],
    miniBio: [ // these are just some "tidbits" about yourself. You can look at mine https://paytonjewell.github.io/#/ for an example if you'd like
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
        // {
        //     emoji: "📧",
        //     text: "thinger"
        // }
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
// Feel free to remove any of these that you don't have. I'll write an FAQ on how to add new ones later, let me know if you have a request for an icon!
// Just change the links so that they lead to your social profiles.

    ],
    bio: "Hi there! My name is Aaron Rohrbacher, and I'm a senior-level full stack software engineer. I'm currently working for a company named Sparq, where I drive our clients' most critical infrastructure decision making. Using the aforementioned decisions, I architect comprehensive cloud infrastructure, and lead my teams as a player-coach in building web apps that our clients fall in love with. I thrive on doing the right thing, and those who do the same! When I'm not behind a computer keyboard, I'm behind a musical one, or playing my saxophone.",
    skills:
        {
            proficientWith: ['AWS, Azure, and Google Cloud Platform', 'Python', 'NodeJS', 'Java', 'Ruby, Ruby on Rails', 'SQL (PostgreSQL, MySQL and derivatives)', 'NoSql Databases (DynamoDB, Mongo)', 'Bash', 'Powershell', 'And so much more...' ],
        }
    ,
// Same as above, change the emojis to match / relate to your hobbies or interests.
// You can also remove the emojis if you'd like, I just think they look cute :P
    portfolio: [ // This is where your portfolio projects will be detailed
        {
            title: "Developer Website",
            live: "https://aaronrohrbacher.com/", //this should be a link to the live version of your project, think github pages, netlify, heroku, etc. Or your own domain, if you have it.
            source: "https://github.com/AaronRohrbacher/aaronRohrbacherPortfolio", // this should be a link to the **repository** of the project, where the code is hosted.
            image: site
        },
        {
            title: "Klear",
            live: "https://store.kde.org/p/2216605",
            source: "https://github.com/AaronRohrbacher/klear_kwin",
            image: klear
        },
        {
            title: "Thinger",
            source: "https://github.com/paytonjewell",
            image: thinger
        },
        {
            title: "ai",
            source: "https://github.com/AaronRohrbacher/ai",
            image: thinger
        },
        {
            title: "Nuel API",
            source: "https://github.com/AaronRohrbacher/nuel-api",
            image: thinger
        }
    ]
}