'use strict'

const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");

const apiKey = process.env.SENDGRID_API_KEY || "secret";

const app = express();
app.set("view engine", "pug");

const store = [];
const templates = {};

app.use(
    bodyParser.urlencoded({
        extended: false
    })
);
app.use(bodyParser.json());

app.use(
    session({
        secret: process.env.SESSION_COOKIE_SECRET || "secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false,
            maxage: 1000 * 60 * 30
        }
    })
);

app.get("/", function(req, res) {
    if (!req.session.user) {
        res.render("login");
        return;
    }
    res.render("index", {
        // only latest 10 mail
        data: store.slice(0, 10)
    });
});

app.post("/", function(req, res) {
    if (req.body.apikey != apiKey) {
        res.render("login", {
            error: "Failed login"
        });
        return;
    }
    req.session.user = {};
    res.redirect(302, "/");
});

app.use(function(req, res, next) {
    res.setHeader('Content-Type', 'application/json')
    next()
})

app.get("/json", function(req, res) {
    const token = req.query.token;
    if (token != apiKey) {
        res.status(401).send("Unauthorized");
        return;
    }
    res.send(store.slice(0, 10));
});

// Protected endpoints
app.use(function(req, res, next) {
    if (!req.header('Authorization').match(apiKey)) {
        res.status(401).send({
            message: 'Unauthorized'
        })
    }
    next()
})

app.delete("/emails", function(req, res) {
    store.length = 0;
    res.status(200).send({ message: 'OK', value: store })
})

app.delete("/templates", function(req, res) {
    Object.keys(templates).forEach(function(key) {
        delete templates[key]
    })
    res.status(200).send({ message: 'OK', value: templates })
})

app.post("/v3/mail/send", function(req, res) {
    const { content, ...message } = req.body;
    message.sent_at = Date.now();

    // sepalate personalizations
    const messages = message.personalizations.map(
        ({ substitutions = {}, ...personalization }) => {
            var result = {...message };

            if (content !== undefined) {
                result['content'] = content.map(c => {
                    if (!c.value) return c;
                    return {
                        ...c,
                        value: Object.keys(substitutions).reduce((value, key) => {
                            return value.split(key).join(substitutions[key]);
                        }, c.value)
                    }
                });
            }
            return result;
        }
    );
    store.unshift(...messages);
    res.status(202).end();
});

app.get("/v3/templates/:id", function(req, res) {
    res.status(200).send((req.body.mock || {
        name: null,
        generation: null,
        versions: [],
        id: req.params.id
    }))
});

app.post("/v3/templates", function(req, res) {;
    if (req.body.name === undefined || req.body.name === null) {
        return res.status(400).send(({ error: 'No name defined' }))
    }
    var id = req.body.id || Object.keys(templates).length + 1
    templates[id] = {
        name: req.body.name,
        id: id,
        generation: req.body.generation || 'none',
        values: req.body.values || []
    }
    res.status(201).send((templates[id]));
})

app.get("/v3/templates", function(req, res) {;
    res.send((Object.values(templates)))
})

const port = process.env.PORT || 3030;
app.listen(port, function() {
    console.log(`start app (port: ${port})`);
});
