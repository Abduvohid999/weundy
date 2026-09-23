require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth');
const bcrypt = require('bcryptjs');

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
        console.error('MongoDB-ga ulanishda xatolik:', err);
    });


// ==================================================
// USER SCHEMA
// ==================================================

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    // Android device ID
    deviceId: {
        type: String,
        unique: true,
        sparse: true
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


// ==================================================
// FOOD LOG SCHEMA
// ==================================================

const FoodLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },

    deviceId: {
        type: String,
        required: false
    },

    foodName: {
        type: String
    },

    calories: {
        type: Number
    },

    protein: {
        type: Number
    },

    fat: {
        type: Number
    },

    carbs: {
        type: Number
    },

    date: {
        type: Date,
        default: Date.now
    }
});


// ==================================================
// DATABASE MODELS
// ==================================================

const User = mongoose.model('User', UserSchema);

const FoodLog = mongoose.model('FoodLog', FoodLogSchema);


// ==================================================
// GROQ MEAL ANALYSIS
// ==================================================

app.post('/api/analyze-meal', async (req, res) => {

    try {

        const {
            imageBase64,
            deviceId,
            userId
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

        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {

            throw new Error(
                "GROQ_API_KEY muhit o'zgaruvchisi topilmadi!"
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

                    model: 'qwen/qwen3.8-27b',

                    reasoning_effort: 'none',

                    messages: [

                        {
                            role: 'user',

                            content: [

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

                                {
                                    type: 'image_url',

                                    image_url: {
                                        url: `data:image/jpeg;base64,${imageBase64}`
                                    }

                                }

                            ]

                        }

                    ],

                    response_format: {
                        type: 'json_object'
                    },

                    max_completion_tokens: 500

                })

            }
        );


        // ------------------------------------------
        // READ GROQ RESPONSE
        // ------------------------------------------

        const data = await response.json();

        console.log('Groq status:', response.status);

        console.log('Groq response:', data);


        // ------------------------------------------
        // CHECK ERROR
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
        // CHECK AI RESPONSE
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
        // GET AI CONTENT
        // ------------------------------------------

        const rawContent =
            data.choices[0].message.content;

        console.log('AI javobi:', rawContent);


        // ------------------------------------------
        // PARSE JSON
        // ------------------------------------------

        const resultData =
            JSON.parse(rawContent);


        // ==================================================
        // SAVE USER ACTIVITY
        // ==================================================

        if (userId) {

            try {

                await User.findByIdAndUpdate(
                    userId,
                    {
                        lastActive: Date.now()
                    }
                );

            } catch (userErr) {

                console.error(
                    'User activity update error:',
                    userErr
                );

            }

        }


        // ==================================================
        // SAVE FOOD LOG
        // ==================================================

        if (userId || deviceId) {

            try {

                const cleanCal =
                    parseInt(resultData.calories) || 0;

                const cleanProt =
                    parseFloat(resultData.protein) || 0;

                const cleanFat =
                    parseFloat(resultData.fats) || 0;

                const cleanCarbs =
                    parseFloat(resultData.carbs) || 0;


                const newLog = new FoodLog({

                    userId: userId || undefined,

                    deviceId: deviceId || undefined,

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
        // SEND RESULT
        // ------------------------------------------

        res.json(resultData);


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
// REGISTER
// ==================================================

app.post('/api/auth/register', async (req, res) => {

    try {

        const {
            username,
            email,
            password,
            deviceId
        } = req.body;


        // ------------------------------------------
        // VALIDATION
        // ------------------------------------------

        if (!username || !email || !password) {

            return res.status(400).json({

                error:
                    'Username, email va password majburiy!'

            });

        }


        // ------------------------------------------
        // CHECK EMAIL
        // ------------------------------------------

        const existingUser =
            await User.findOne({
                email: email.toLowerCase()
            });


        if (existingUser) {

            return res.status(400).json({

                error:
                    "Bu email allaqachon band qilingan!"

            });

        }


        // ------------------------------------------
        // HASH PASSWORD
        // ------------------------------------------

        const hashedPassword =
            await bcrypt.hash(password, 10);


        // ------------------------------------------
        // CREATE USER
        // ------------------------------------------

        const newUser = new User({

            username,

            email:
                email.toLowerCase(),

            password:
                hashedPassword,

            deviceId:
                deviceId || undefined

        });


        await newUser.save();


        // ------------------------------------------
        // RESPONSE
        // ------------------------------------------

        res.json({

            success: true,

            message:
                "Muvaffaqiyatli ro'yxatdan o'tdingiz!",

            user: {

                id:
                    newUser._id,

                username:
                    newUser.username,

                email:
                    newUser.email

            }

        });


    } catch (err) {

        console.error(
            'Register error:',
            err
        );


        res.status(500).json({

            error:
                'Server xatoligi: ' +
                err.message

        });

    }

});


// ==================================================
// LOGIN
// ==================================================

app.post('/api/auth/login', async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        // ------------------------------------------
        // VALIDATION
        // ------------------------------------------

        if (!email || !password) {

            return res.status(400).json({

                error:
                    'Email va parolni kiriting!'

            });

        }


        // ------------------------------------------
        // FIND USER
        // ------------------------------------------

        const user =
            await User.findOne({
                email: email.toLowerCase()
            });


        if (!user) {

            return res.status(400).json({

                error:
                    "Email yoki parol noto'g'ri!"

            });

        }


        // ------------------------------------------
        // CHECK PASSWORD
        // ------------------------------------------

        const isMatch =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!isMatch) {

            return res.status(400).json({

                error:
                    "Email yoki parol noto'g'ri!"

            });

        }


        // ------------------------------------------
        // UPDATE LAST ACTIVE
        // ------------------------------------------

        user.lastActive =
            Date.now();

        await user.save();


        // ------------------------------------------
        // RESPONSE
        // ------------------------------------------

        res.json({

            success: true,

            message:
                'Xush kelibsiz!',

            user: {

                id:
                    user._id,

                username:
                    user.username,

                email:
                    user.email

            }

        });


    } catch (err) {

        console.error(
            'Login error:',
            err
        );


        res.status(500).json({

            error:
                'Server xatoligi: ' +
                err.message

        });

    }

});


// ==================================================
// USER PROFILE + FOOD HISTORY
// ==================================================

app.get(
    '/api/user/profile/:userId',
    async (req, res) => {

        try {

            const {
                userId
            } = req.params;


            // --------------------------------------
            // FIND USER
            // --------------------------------------

            const user =
                await User
                    .findById(userId)
                    .select('-password');


            if (!user) {

                return res.status(404).json({

                    error:
                        'Foydalanuvchi topilmadi!'

                });

            }


            // --------------------------------------
            // FIND FOOD HISTORY
            // --------------------------------------

            const logs =
                await FoodLog
                    .find({
                        userId: userId
                    })
                    .sort({
                        date: -1
                    });


            // --------------------------------------
            // RESPONSE
            // --------------------------------------

            res.json({

                user,

                logs

            });


        } catch (err) {

            console.error(
                'Profile error:',
                err
            );


            res.status(500).json({

                error:
                    "Ma'lumotlarni olishda xatolik"

            });

        }

    }
);


// ==================================================
// SAVE FOOD MANUALLY
// ==================================================

app.post('/api/save-food', async (req, res) => {

    try {

        const {
            userId,
            deviceId,
            foodName,
            calories,
            protein,
            fat,
            carbs
        } = req.body;


        // ------------------------------------------
        // CHECK USER
        // ------------------------------------------

        if (!userId && !deviceId) {

            return res.status(400).json({

                error:
                    "Foydalanuvchi aniqlanmadi. Iltimos qaytadan kiring!"

            });

        }


        // ------------------------------------------
        // UPDATE USER
        // ------------------------------------------

        if (userId) {

            await User.findByIdAndUpdate(

                userId,

                {
                    lastActive:
                        Date.now()
                }

            );

        }


        // ------------------------------------------
        // SAVE FOOD
        // ------------------------------------------

        const newLog = new FoodLog({

            userId:
                userId || undefined,

            deviceId:
                deviceId || undefined,

            foodName,

            calories:
                parseInt(calories) || 0,

            protein:
                parseFloat(protein) || 0,

            fat:
                parseFloat(fat) || 0,

            carbs:
                parseFloat(carbs) || 0

        });


        await newLog.save();


        // ------------------------------------------
        // RESPONSE
        // ------------------------------------------

        res.json({

            success: true,

            message:
                "Ovqat tarixi profilingizga saqlandi!"

        });


    } catch (err) {

        console.error(
            'Manual save error:',
            err
        );


        res.status(500).json({

            error:
                'Saqlashda xatolik: ' +
                err.message

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
// ADMIN STATS
// ==================================================

app.get(
    '/api/admin/stats',
    adminAuth,
    async (req, res) => {

        try {

            const totalUsers =
                await User.countDocuments();


            const totalScans =
                await FoodLog.countDocuments();


            const recentLogs =
                await FoodLog
                    .find()
                    .sort({
                        date: -1
                    })
                    .limit(10);


            res.json({

                totalUsers,

                totalScans,

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
// HEALTH CHECK
// ==================================================

app.get('/', (req, res) => {

    res.json({

        success: true,

        message:
            'WEUNDY MEAL AI SERVER ishlayapti!',

        model:
            'qwen/qwen3.8-27b'

    });

});


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
            `Server PORT: ${PORT}`
        );
        console.log(
            'Groq Vision: qwen/qwen3.8-27b'
        );
        console.log('');
        console.log(
            'Server muvaffaqiyatli ishga tushdi!'
        );
        console.log('');

    }
);