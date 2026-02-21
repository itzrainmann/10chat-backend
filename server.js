const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())
app.use(express.static('public'))

const supabase = createClient(
    'https://yyfgmikrtjcwvzvdotoq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZmdtaWtydGpjd3Z6dmRvdG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjI3NzgsImV4cCI6MjA4NzE5ODc3OH0.QvGwJyLgOwPfHdUnWS-r-6wvj7ODIK-gunpMHhTpScc'
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

app.listen(3000, () => console.log('Running on http://localhost:3000'))