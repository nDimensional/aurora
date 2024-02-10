export function merge(
	oldValues: Uint32Array,
	oldValueCount: number,
	newValues: Uint32Array,
	newValueCount: number,
	onAdded: (value: number) => void,
	onRemoved: (value: number) => void
) {
	let i = 0; // Index for oldValues
	let j = 0; // Index for newValues

	while (i < oldValueCount && j < newValueCount) {
		if (oldValues[i] < newValues[j]) {
			// Value is in oldValues but not in newValues
			onRemoved(oldValues[i]);
			i++;
		} else if (oldValues[i] > newValues[j]) {
			// Value is in newValues but not in oldValues
			onAdded(newValues[j]);
			j++;
		} else {
			// Value is present in both arrays, move to the next elements
			i++;
			j++;
		}
	}

	// Process any remaining values in oldValues
	while (i < oldValueCount) {
		onRemoved(oldValues[i]);
		i++;
	}

	// Process any remaining values in newValues
	while (j < newValueCount) {
		onAdded(newValues[j]);
		j++;
	}
}
