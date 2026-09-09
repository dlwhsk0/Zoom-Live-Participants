import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { login } from "./api.ts";

/**
 * 어드민 로그인.
 *
 * 참가자 화면에는 로그인이 없다. 이 폼은 어드민 화면에만 있다.
 * 계정은 서버 스크립트로만 만든다 — 여기에 가입은 없다.
 */
export default function LoginForm() {
	const queryClient = useQueryClient();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const submit = useMutation({
		mutationFn: () => login({ username, password }),
		onSuccess: () => {
			setPassword("");
			// 로그인 상태를 다시 물어보면 화면이 넘어간다
			void queryClient.invalidateQueries({ queryKey: ["me"] });
		},
	});

	return (
		<main className="screen">
			<form
				className="login"
				onSubmit={(event) => {
					event.preventDefault();
					if (!submit.isPending) submit.mutate();
				}}
			>
				<h1 className="login__title">로그인</h1>

				<label className="login__label" htmlFor="username">
					아이디
				</label>
				<input
					id="username"
					className="login__input"
					value={username}
					onChange={(event) => setUsername(event.target.value)}
					autoComplete="username"
					autoCapitalize="none"
					autoFocus
				/>

				<label className="login__label" htmlFor="password">
					비밀번호
				</label>
				<input
					id="password"
					className="login__input"
					type="password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					autoComplete="current-password"
				/>

				{submit.isError && (
					<p className="login__error" role="alert">
						{submit.error.message}
					</p>
				)}

				<button
					type="submit"
					className="login__submit"
					disabled={submit.isPending || !username || !password}
				>
					{submit.isPending ? "확인하는 중…" : "로그인"}
				</button>
			</form>
		</main>
	);
}
