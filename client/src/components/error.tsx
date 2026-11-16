import "../styles/error.css";

export function Error({ message }: { message: string }) {
    return (
        <div className="error">
            <p>{message}</p>
        </div>
    );
}