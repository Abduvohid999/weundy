const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB-ga ulanish
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB-ga muvaffaqiyatli ulandi!'))
  .catch((err) => console.error('MongoDB-ga ulanishda xatolik:', err));
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// ===============================
// GROQ API KEY
// ===============================
const apiKey = process.env.GROQ_API_KEY;

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());

// Rasm katta bo'lishi mumkin
app.use(express.json({ limit: '20mb' }));

// public papka
app.use(express.static('public'));


// ===============================
// ANALYZE MEAL
// ===============================
app.post('/api/analyze-meal', async (req, res) => {

    try {

        const { imageBase64 } = req.body;

        // Rasm kelganini tekshirish
        if (!imageBase64) {

            return res.status(400).json({
                error: "Rasm topilmadi!"
            });

        }


        // ===============================
        // GROQ API REQUEST
        // ===============================

        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",

                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    // YANGI GROQ VISION MODEL
                    model: "qwen/qwen3.8-27b",

                    messages: [

                        {
                            role: "user",

                            content: [

                                // TEXT
                                {
                                    type: "text",

                                    text: `
Bu rasmdagi taomni tahlil qil.

Taomning:

- nomini
- tarkibini
- taxminiy kaloriyasini
- protein miqdorini
- uglevod miqdorini
- yog' miqdorini

aniqla.

Rasm asosida taxminiy hisobla.

Javobni FAQAT quyidagi JSON formatida ber:

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


                                // IMAGE
                                {
                                    type: "image_url",

                                    image_url: {
                                        url: `data:image/jpeg;base64,${imageBase64}`
                                    }

                                }

                            ]

                        }

                    ],


                    // JSON MODE
                    response_format: {
                        type: "json_object"
                    },

                    // Keraksiz reasoningni o'chiramiz
                    reasoning_effort: "none",

                    // Javob uzunligi
                    max_completion_tokens: 500

                })

            }
        );


        // ===============================
        // RESPONSE
        // ===============================

        const data = await response.json();


        console.log("Groq status:", response.status);
        console.log("Groq response:", data);


        // ===============================
        // GROQ ERROR
        // ===============================

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


        // ===============================
        // AI JAVOBINI OLISH
        // ===============================

        if (
            !data.choices ||
            !data.choices[0] ||
            !data.choices[0].message
        ) {

            throw new Error(
                "Groq AI javob qaytarmadi."
            );

        }


        const rawContent =
            data.choices[0].message.content;


        console.log(
            "AI javobi:",
            rawContent
        );


        // ===============================
        // JSON PARSE
        // ===============================

        const resultData =
            JSON.parse(rawContent);


        // ===============================
        // ANDROID / FRONTEND GA YUBORISH
        // ===============================

        res.json(resultData);


    } catch (error) {

        console.error(
            "XATOLIK:",
            error
        );


        res.status(500).json({

            error:
                "Groq AIni ishlatishda xatolik yuz berdi: "
                + error.message

        });

    }

});


// ===============================
// SERVER
// ===============================

app.listen(PORT, () => {

    console.log("");
    console.log("=================================");
    console.log("  GROQ MEAL AI SERVER");
    console.log("=================================");
    console.log("");
    console.log(
        `Server ishga tushdi: http://localhost:${PORT}`
    );
    console.log("");
    console.log(
        "Vision model: qwen/qwen3.8-27b"
    );
    console.log("");

});
// 1. Ma'lumotlar bazasi sxemalari (Models)
const UserSchema = new mongoose.Schema({
    deviceId: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const FoodLogSchema = new mongoose.Schema({
    deviceId: String,
    foodName: String,
    calories: Number,
    protein: Number,
    fat: Number,
    carbs: Number,
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const FoodLog = mongoose.model('FoodLog', FoodLogSchema);

// 2. AI tahlil qilib bo'lingach, ma'lumotni bazaga saqlash endpointi (yoki mavjud AI endpoint ichiga qo'shish)
app.post('/api/save-food', async (req, res) => {
    try {
        const { deviceId, foodName, calories, protein, fat, carbs } = req.body;
        
        // Foydalanuvchini bazaga qo'shish (agar yo'q bo'lsa)
        await User.findOneAndUpdate(
            { deviceId }, 
            { lastActive: Date.now() }, 
            { upsert: true, new: true }
        );

        // Taomni saqlash
        const newLog = new FoodLog({
            deviceId,
            foodName,
            calories,
            protein,
            fat,
            carbs
        });
        await newLog.save();

        res.json({ success: true, message: "Ma'lumot bazaga saqlandi!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Saqlashda xatolik yuz berdi" });
    }
});
const basicAuth = require('express-basic-auth');

// Admin parolini .env dan o'qiydi
const adminAuth = basicAuth({
    users: { [process.env.ADMIN_USERNAME]: process.env.ADMIN_PASSWORD },
    challenge: true,
    realm: 'Weundy Admin Panel'
});

// Statistika API
app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalScans = await FoodLog.countDocuments();
        const recentLogs = await FoodLog.find().sort({ date: -1 }).limit(10);

        res.json({
            totalUsers,
            totalScans,
            recentLogs
        });
    } catch (err) {
        res.status(500).json({ error: "Server xatoligi" });
    }
});