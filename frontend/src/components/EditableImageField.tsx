import ResourcePickerField from './ResourcePickerField';

type EditableImageFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  previewAlt?: string;
};

export default function EditableImageField({
  value,
  onChange,
  disabled = false,
  previewAlt = 'Image'
}: EditableImageFieldProps) {
  return (
    <ResourcePickerField
      label="Bibliothèque image"
      value={{ url: value }}
      onChange={(next) => onChange(next.url ?? '')}
      kinds={['image']}
      scopeTypes={['account']}
      disabled={disabled}
      allowManualUrl
      allowUpload
      uploadScopeType="account"
      uploadVisibility="private"
      previewAlt={previewAlt}
      urlPlaceholder="https://.../image.png"
      emptyOptionLabel="Choisir dans ma bibliothèque"
    />
  );
}
