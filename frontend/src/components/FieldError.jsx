import './FieldError.css'

export default function FieldError({ message, id }) {
  if (!message) return null

  return (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  )
}
