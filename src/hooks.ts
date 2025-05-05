import React, { useEffect, useMemo, useRef, useState } from "react";

export function useMemoRef<T>(factory: () => T, deps: React.DependencyList): [value: T, valueRef: React.RefObject<T>] {
	const value = useMemo(factory, deps);
	const valueRef = useRef(value);
	useEffect(() => void (valueRef.current = value), [value]);
	return [value, valueRef];
}

export function useStateRef<T>(
	initialValue: T,
): [value: T, setValue: React.Dispatch<React.SetStateAction<T>>, valueRef: React.RefObject<T>] {
	const [value, setValue] = useState(initialValue);
	const valueRef = useRef(value);
	useEffect(() => void (valueRef.current = value), [value]);
	return [value, setValue, valueRef];
}
