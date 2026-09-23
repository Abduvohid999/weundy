require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());

app.use(express.json({
    limit: '20mb'
}));

app.use(express.static('public'));


// ==================================================
// MONGODB CONNECTION
// ==================================================

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB-ga muvaffaqiyatli ulandi!');
    })
    .catch((err) => {
        console.error(
            'MongoDB-ga ulanishda xatolik:',
            err
        );
    });


// ==================================================
// DATABASE SCHEMAS
// ==================================================

const UserSchema = new mongoose.Schema({

    deviceId: {
        type: String,
        unique: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    lastActive: {
        type: Date,
        default: Date.now
    }

});


const FoodLogSchema = new mongoose.Schema({

    deviceId: String,

    foodName: String,

    calories: Number,

    protein: Number,

    fat: Number,

    carbs: Number,

    date: {
        type: Date,
        default: Date.now
    }

});


// ==================================================
// DATABASE MODELS
// ==================================================

const User = mongoose.model(
    'User',
    UserSchema
);

const FoodLog = mongoose.model(
    'FoodLog',
    FoodLogSchema
);


// ==================================================
// ANALYZE MEAL - GROQ VISION
// ==================================================

app.post('/api/analyze-meal', async (req, res) => {

    try {

        const {
            imageBase64,
            deviceId
        } = req.body;


        // ------------------------------------------
        // CHECK IMAGE
        // ------------------------------------------

        if (!imageBase64) {

            return res.status(400).json({
                error: 'Rasm topilmadi!'
            });

        }


        // ------------------------------------------
        // GROQ API KEY
        // ------------------------------------------

        const apiKey =
            process.env.GROQ_API_KEY;


        if (!apiKey) {

            throw new Error(
                'GROQ_API_KEY muhit o\'zgaruvchisi topilmadi!'
            );

        }


        // ------------------------------------------
        // GROQ REQUEST
        // ------------------------------------------

        const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                method: 'POST',

                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({

                    // --------------------------------
                    // CURRENT GROQ VISION MODEL
                    // --------------------------------

                    model: 'qwen/qwen3.8-27b',


                    // --------------------------------
                    // MESSAGES
                    // --------------------------------

                    messages: [

                        {
                            role: 'user',

                            content: [

                                // ==========================
                                // TEXT
                                // ==========================

                                {
                                    type: 'text',

                                    text: `
Bu rasmdagi taomni tahlil qil.

Quyidagilarni aniqlashga harakat qil:

1. Taom nomi
2. Taom tarkibi
3. Taxminiy kaloriya
4. Protein
5. Uglevod
6. Yog'

Rasmga qarab taxminiy qiymatlarni hisobla.

Natijani FAQAT quyidagi JSON formatida qaytar:

{
    "calories": "485 kcal",
    "items": "Taom nomi va tarkibi o'zbek tilida",
    "protein": "35g",
    "carbs": "45g",
    "fats": "18g"
}

Hech qanday qo'shimcha matn yozma.
Faqat JSON qaytar.
`
                                },


                                // ==========================
                                // IMAGE
                                // ==========================

                                {
                                    type: 'image_url',

                                    image_url: {
                                        url:
                                            `data:image/jpeg;base64,${imageBase64}`
                                    }
                                }

                            ]
                        }

                    ],


                    // --------------------------------
                    // JSON RESPONSE
                    // --------------------------------

                    response_format: {
                        type: 'json_object'
                    },


                    // --------------------------------
                    // MAX TOKENS
                    // --------------------------------

                    max_completion_tokens: 500

                })

            }
        );


        // ------------------------------------------
        // READ RESPONSE
        // ------------------------------------------

        const data =
            await response.json();


        console.log(
            'Groq status:',
            response.status
        );


        console.log(
            'Groq response:',
            data
        );


        // ------------------------------------------
        // CHECK GROQ ERROR
        // ------------------------------------------

        if (!response.ok) {

            throw new Error(
                data.error?.message ||
                `Groq API xatosi: ${response.status}`
            );

        }


        if (data.error) {

            throw new Error(
                data.error.message
            );

        }


        // ------------------------------------------
        // CHECK CHOICES
        // ------------------------------------------

        if (
            !data.choices ||
            !data.choices[0] ||
            !data.choices[0].message
        ) {

            throw new Error(
                'Groq AI javob qaytarmadi.'
            );

        }


        // ------------------------------------------
        // GET AI RESPONSE
        // ------------------------------------------

        const rawContent =
            data.choices[0]
                .message
                .content;


        console.log(
            'AI javobi:',
            rawContent
        );


        // ------------------------------------------
        // PARSE JSON
        // ------------------------------------------

        const resultData =
            JSON.parse(rawContent);


        // ==================================================
        // SAVE TO MONGODB
        // ==================================================

        if (deviceId) {

            try {

                // --------------------------------------
                // CREATE / UPDATE USER
                // --------------------------------------

                await User.findOneAndUpdate(

                    {
                        deviceId: deviceId
                    },

                    {
                        lastActive: Date.now()
                    },

                    {
                        upsert: true,
                        new: true
                    }

                );


                // --------------------------------------
                // CONVERT NUMBERS
                // --------------------------------------

                const cleanCal =
                    parseInt(
                        resultData.calories
                    ) || 0;


                const cleanProt =
                    parseFloat(
                        resultData.protein
                    ) || 0;


                const cleanFat =
                    parseFloat(
                        resultData.fats
                    ) || 0;


                const cleanCarbs =
                    parseFloat(
                        resultData.carbs
                    ) || 0;


                // --------------------------------------
                // CREATE FOOD LOG
                // --------------------------------------

                const newLog =
                    new FoodLog({

                        deviceId: deviceId,

                        foodName:
                            resultData.items,

                        calories:
                            cleanCal,

                        protein:
                            cleanProt,

                        fat:
                            cleanFat,

                        carbs:
                            cleanCarbs

                    });


                // --------------------------------------
                // SAVE
                // --------------------------------------

                await newLog.save();


                console.log(
                    'Taom MongoDB-ga saqlandi!'
                );


            } catch (dbErr) {

                console.error(
                    'Bazaga saqlashda xatolik:',
                    dbErr
                );

            }

        }


        // ------------------------------------------
        // SEND RESULT TO APP
        // ------------------------------------------

        res.json(
            resultData
        );


    } catch (error) {

        console.error(
            'XATOLIK:',
            error
        );


        res.status(500).json({

            error:
                'Groq AIni ishlatishda xatolik yuz berdi: ' +
                error.message

        });

    }

});


// ==================================================
// MANUAL SAVE FOOD
// ==================================================

app.post('/api/save-food', async (req, res) => {

    try {

        const {
            deviceId,
            foodName,
            calories,
            protein,
            fat,
            carbs
        } = req.body;


        // ------------------------------------------
        // UPDATE USER
        // ------------------------------------------

        await User.findOneAndUpdate(

            {
                deviceId: deviceId
            },

            {
                lastActive: Date.now()
            },

            {
                upsert: true,
                new: true
            }

        );


        // ------------------------------------------
        // CREATE FOOD LOG
        // ------------------------------------------

        const newLog =
            new FoodLog({

                deviceId: deviceId,

                foodName: foodName,

                calories: calories,

                protein: protein,

                fat: fat,

                carbs: carbs

            });


        // ------------------------------------------
        // SAVE FOOD
        // ------------------------------------------

        await newLog.save();


        res.json({

            success: true,

            message:
                'Ma\'lumot bazaga saqlandi!'

        });


    } catch (err) {

        console.error(
            'Manual save error:',
            err
        );


        res.status(500).json({

            error:
                'Saqlashda xatolik yuz berdi'

        });

    }

});


// ==================================================
// ADMIN AUTHENTICATION
// ==================================================

const adminAuth =
    basicAuth({

        users: {

            [process.env.ADMIN_USERNAME]:
                process.env.ADMIN_PASSWORD

        },

        challenge: true,

        realm:
            'Weundy Admin Panel'

    });


// ==================================================
// ADMIN STATS API
// ==================================================

app.get(
    '/api/admin/stats',
    adminAuth,
    async (req, res) => {

        try {

            // --------------------------------------
            // TOTAL USERS
            // --------------------------------------

            const totalUsers =
                await User.countDocuments();


            // --------------------------------------
            // TOTAL SCANS
            // --------------------------------------

            const totalScans =
                await FoodLog.countDocuments();


            // --------------------------------------
            // RECENT LOGS
            // --------------------------------------

            const recentLogs =
                await FoodLog
                    .find()
                    .sort({
                        date: -1
                    })
                    .limit(10);


            // --------------------------------------
            // RESPONSE
            // --------------------------------------

            res.json({

                totalUsers:
                    totalUsers,

                totalScans:
                    totalScans,

                recentLogs:
                    recentLogs

            });


        } catch (err) {

            console.error(
                'Admin stats error:',
                err
            );


            res.status(500).json({

                error:
                    'Server xatoligi'

            });

        }

    }
);


// ==================================================
// SERVER START
// ==================================================

app.listen(
    PORT,
    () => {

        console.log('');
        console.log('====================================');
        console.log('       WEUNDY MEAL AI SERVER');
        console.log('====================================');
        console.log('');

        console.log(
            `Server: http://localhost:${PORT}`
        );

        console.log('');

        console.log(
            'Groq Vision: qwen/qwen3.8-27b'
        );

        console.log('');

    }
);