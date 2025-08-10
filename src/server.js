const express = require('express')
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
var cors = require('cors')
const apiRouter = require('./routes');
//const errorHandler = require('./middlewares/errorsHandling');
require('dotenv').config();

//mongoDb connect
mongoose.set("strictQuery", false);
mongoose.connect(
  `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}.mongodb.net/?retryWrites=true&w=majority` 
).then(() => {
  console.log("successfully connect to database")
}).catch(err=>console.log(err))

//Middlewares & routes
app.use(cors());

// Route Stripe webhook AVANT tout bodyParser.json()
app.post(
  '/api/stripe/webhook',
  bodyParser.raw({ type: 'application/json' }),
  require('./controllers/stripe.controller').webhook
);

// Ensuite, le reste du parsing JSON
app.use(bodyParser.json());
app.use("/api", apiRouter);
//app.use(errorHandler);
//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// start app
app.listen(process.env.PORT, function () {
  console.log("Server launch");
}); 