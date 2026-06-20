import { useState, useEffect } from 'react'
import { api } from '../db'

export default function Planner({ userId, dateString }) {
    const [todos, setTodos] = useState([])
    const [newTask, setNewTask] = useState('')

    const loadTodos = async () => {
        setTodos(await api.getTodos(userId, dateString))
    }

    useEffect(() => { loadTodos() }, [userId, dateString])

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!newTask.trim()) return
        await api.addTodo({ userId, date: dateString, task_text: newTask.trim() })
        setNewTask('')
        loadTodos()
    }

    const handleToggle = async (id) => {
        await api.toggleTodo(id)
        loadTodos()
    }

    const handleDelete = async (id) => {
        await api.deleteTodo(id)
        loadTodos()
    }

    return (
        <div className="glass-card">
            <h2>오늘의 학습 계획표 📝</h2>
            <p className="small-text" style={{marginBottom: '1rem'}}>오늘 공부할 목표를 적고 달성해보세요!</p>
            
            <form onSubmit={handleAdd} style={{display:'flex', gap:'0.5rem', marginBottom:'1rem'}}>
                <input 
                    type="text" 
                    value={newTask} 
                    onChange={e => setNewTask(e.target.value)} 
                    placeholder="예: 영어 단어 50개 암기" 
                    style={{flex:1}}
                />
                <button type="submit" className="btn btn-primary btn-small">추가</button>
            </form>

            <div className="todo-list">
                {todos.length === 0 ? <p style={{color:'#94a3b8', textAlign:'center', marginTop:'1rem'}}>계획을 추가해보세요.</p> : null}
                {todos.map(t => (
                    <div key={t.id} className="todo-item">
                        <input 
                            type="checkbox" 
                            className="todo-checkbox"
                            checked={t.is_completed} 
                            onChange={() => handleToggle(t.id)} 
                        />
                        <span className={`todo-text ${t.is_completed ? 'completed' : ''}`}>
                            {t.task_text}
                        </span>
                        <span className="todo-delete" onClick={() => handleDelete(t.id)}>🗑️</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
