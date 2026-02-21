const express = require('express')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// GET all posts
app.get('/api/posts', async (req, res) => {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error })
    res.json(data)
})

// POST new post
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

// UNLIKE a post
app.post('/api/posts/:id/unlike', async (req, res) => {
    const { id } = req.params
    const { data: post } = await supabase
        .from('posts').select('likes').eq('id', id).single()
    const { error } = await supabase.from('posts')
        .update({ likes: Math.max(0, post.likes - 1) }).eq('id', id)
    if (error) return res.status(500).json({ error })
    res.json({ success: true })
})

// DELETE a post
app.delete('/api/posts/:id', async (req, res) => {
    const { id } = req.params
    const { error } = await supabase.from('posts').delete().eq('id', id)
    if (error) return res.status(500).json({ error })
    res.json({ success: true })
})
app.post('/api/visit', async (req, res) => {
    const { data } = await supabase.from('visits').select('count').single()
    await supabase.from('visits').update({ count: data.count + 1 })
    res.json({ count: data.count + 1 })
})

app.get('/api/visits', async (req, res) => {
    const { data } = await supabase.from('visits').select('count').single()
    res.json({ count: data.count })
})
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Running on port ' + PORT))