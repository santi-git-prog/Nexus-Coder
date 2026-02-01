import { useEffect, useState } from "react";
import api from "../api/axios";
import { Link } from "react-router-dom";
import "./Problems.css";

type Problem = {
  id: string;
  title: string;
  difficulty: string;
};

export default function Problems() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/problems")
      .then((res) => setProblems(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading problems...</p>;

  return (
    <div className="problems-page">
      <h1>Problems</h1>

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Difficulty</th>
          </tr>
        </thead>

        <tbody>
          {problems.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/problems/${p.id}`}>{p.title}</Link>
              </td>
              <td className={`difficulty ${p.difficulty.toLowerCase()}`}>
                {p.difficulty}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
