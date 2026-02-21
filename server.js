const express = require('express')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))
const fs = require('fs')
console.log('Files in directory:', fs.readdirSync(__dirname))
console.log('Public exists:', fs.existsSync(path.join(__dirname, 'public')))

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
)

// GET all posts (newest first)
app.get('/api/posts', async (req, res) => {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error })
    res.json(data)
})
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})
// POST a new post (admin only — keep this URL secret)
app.post('/api/posts', async (req, res) => {
    const { title, body } = req.body
    const { data, error } = await supabase
        .from('posts')
        .insert([{ title, body, likes: 0 }])
    if (error) return res.status(500).json({ error })
    res.json({ success: true, data })
})

// LIKE a post
app.post('/api/posts/:id/like', async (req, res) => {
    const { id } = req.params
    const { data: post } = await supabase
        .from('posts').select('likes').eq('id', id).single()
    const { error } = await supabase.from('posts')
        .update({ likes: post.likes + 1 }).eq('id', id)
    if (error) return res.status(500).json({ error })
    res.json({ success: true })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Running on port ' + PORT))