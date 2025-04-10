import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page, Card, FormLayout, TextField, Select, Banner, BlockStack
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
// import { getSession, commitSession } from "~/sessions.server"; // Para el mensaje flash - TEMPORARILY DISABLED

// Loader function to ensure authentication
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request); // Just authenticate
  return json({}); // Return empty JSON, we don't load data here
};

// Action function para manejar la creación
export const action = async ({ request }: ActionFunctionArgs) => {
  // Autenticar y obtener la sesión de Remix
  await authenticate.admin(request);
  // const remixSession = await getSession(request.headers.get("Cookie")); // TEMPORARILY DISABLED

  const formData = await request.formData();

  // No necesitamos 'intent' aquí porque esta ruta solo hace una cosa: crear
  const name = formData.get("name") as string;
  const durationMonthsStr = formData.get("durationMonths") as string;
  const priceType = formData.get("priceType") as string;
  const priceValueStr = formData.get("priceValue") as string;
  const description = formData.get("description") as string | null;

  const errors: Record<string, string> = {};

  // Validación (igual que antes)
  if (!name) errors.name = "Name is required.";
  if (!durationMonthsStr) errors.durationMonths = "Duration is required.";
  if (!priceType) errors.priceType = "Price type is required.";
  if (!priceValueStr) errors.priceValue = "Price value is required.";

  let durationMonths = NaN;
  if (durationMonthsStr) {
     durationMonths = parseInt(durationMonthsStr, 10);
     if (isNaN(durationMonths) || durationMonths <= 0) {
         errors.durationMonths = "Duration must be a positive number.";
     }
  }

  let priceValue = NaN;
   if (priceValueStr) {
      priceValue = parseFloat(priceValueStr);
      if (isNaN(priceValue) || priceValue < 0) {
          errors.priceValue = "Price value must be a non-negative number.";
      }
   }

  if (priceType !== "PERCENTAGE" && priceType !== "FIXED") {
     errors.priceType = "Invalid price type selected.";
  }

  // Si hay errores, devolverlos junto con los valores del formulario
  if (Object.keys(errors).length > 0) {
     return json(
       { errors, fieldValues: Object.fromEntries(formData) },
       { status: 400 /*, headers: { "Set-Cookie": await commitSession(remixSession) } */ } // TEMPORARILY DISABLED
     );
  }

  // Si no hay errores, intentar crear en la BD
  try {
    const newDefinition = await prisma.warrantyDefinition.create({
      data: {
        name,
        durationMonths,
        priceType,
        priceValue,
        description: description || null,
      },
    });
     // Poner mensaje flash en la sesión - TEMPORARILY DISABLED
     // remixSession.flash("successMessage", `Warranty definition "${newDefinition.name}" created successfully!`);
     // Redirigir de vuelta a la lista, SIN confirmar la sesión personalizada
     // Use Shopify's redirect helper if needed, though redirect from Remix might be okay here
     // as long as we don't try to set the custom session cookie.
     return redirect("/app/warranties" /*, {
       headers: { "Set-Cookie": await commitSession(remixSession) },
     } */ ); // TEMPORARILY DISABLED
  } catch (error) {
    console.error("Failed to create warranty definition:", error);
    // Devolver error general, SIN confirmar sesión personalizada
    return json(
      { errors: { form: "Failed to save warranty definition to the database." }, fieldValues: Object.fromEntries(formData) },
      { status: 500 /*, headers: { "Set-Cookie": await commitSession(remixSession) } */ } // TEMPORARILY DISABLED
    );
  }
};

// --- Componente de la página ---
export default function NewWarrantyDefinitionPage() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit(); // Hook para enviar el formulario programáticamente

  // Recuperar valores de campos si hubo un error, o usar valores iniciales
  const initialValues = actionData?.fieldValues ? actionData.fieldValues as Record<string, string> : {
       name: '',
       durationMonths: '12',
       priceType: 'PERCENTAGE',
       priceValue: '10',
       description: '',
   };

  // Estado para los campos del formulario (controlado)
  const [formState, setFormState] = useState(initialValues);

  const handleFormChange = useCallback(
      (value: string, field: keyof typeof formState) => {
          setFormState((prev) => ({ ...prev, [field]: value }));
      },
      [],
  );

  // Separar tipos de errores
  const rawErrors = actionData?.errors;
  const fieldErrors = (rawErrors && typeof rawErrors === 'object' && !('form' in rawErrors))
                      ? rawErrors as Record<string, string> // Errores específicos de campo
                      : null;
  const generalFormError = (rawErrors && typeof rawErrors === 'object' && 'form' in rawErrors)
                           ? rawErrors.form as string // Error general del formulario
                           : null;

   // Handler para el botón Save de la Page
   const handleSave = useCallback(() => {
       const form = document.getElementById('warranty-form') as HTMLFormElement;
       if (form) {
           submit(form); // Usar submit de Remix
       }
   }, [submit]);

  return (
    <Page
        title="Create New Warranty Definition"
        backAction={{ content: 'Warranty Definitions', onAction: () => navigate('/app/warranties') }}
        primaryAction={{
            content: 'Save',
            onAction: handleSave, // Llamar al handler
        }}
    >
        {/* ID del Form para referencia */}
        <Form method="post" id="warranty-form">
            <Card>
                <BlockStack gap="400">
                   {/* Usar generalFormError */}
                   {generalFormError && (
                       <Banner title="Error saving definition" tone="critical">
                           <p>{generalFormError}</p>
                       </Banner>
                   )}
                   <FormLayout>
                       <TextField
                           label="Name"
                           name="name"
                           value={formState.name}
                           onChange={(value) => handleFormChange(value, 'name')}
                           autoComplete="off"
                           requiredIndicator
                           helpText="A descriptive name (e.g., '12-Month Electronics Warranty')."
                           error={fieldErrors?.name} // Usar fieldErrors
                       />
                       <TextField
                           label="Duration (Months)"
                           name="durationMonths"
                           type="number"
                           value={formState.durationMonths}
                           onChange={(value) => handleFormChange(value, 'durationMonths')}
                           autoComplete="off"
                           requiredIndicator
                           min={1}
                           error={fieldErrors?.durationMonths} // Usar fieldErrors
                       />
                      <Select
                          label="Price Type"
                          name="priceType"
                          options={[
                              { label: 'Percentage of Product Price', value: 'PERCENTAGE' },
                              { label: 'Fixed Amount', value: 'FIXED' },
                          ]}
                          value={formState.priceType}
                          onChange={(value) => handleFormChange(value, 'priceType')}
                          requiredIndicator
                          error={fieldErrors?.priceType} // Usar fieldErrors
                      />
                       <TextField
                           label={formState.priceType === 'PERCENTAGE' ? 'Percentage Value (%)' : 'Fixed Price ($)'}
                           name="priceValue"
                           type="number"
                           step={0.01}
                           value={formState.priceValue}
                           onChange={(value) => handleFormChange(value, 'priceValue')}
                           autoComplete="off"
                           requiredIndicator
                           min={0}
                           prefix={formState.priceType === 'FIXED' ? '$' : undefined}
                           suffix={formState.priceType === 'PERCENTAGE' ? '%' : undefined}
                           error={fieldErrors?.priceValue} // Usar fieldErrors
                       />
                        <TextField
                            label="Description (Optional)"
                            name="description"
                            value={formState.description}
                            onChange={(value) => handleFormChange(value, 'description')}
                            autoComplete="off"
                            multiline={3}
                            helpText="Optional details about the warranty coverage."
                            error={fieldErrors?.description} // Usar fieldErrors
                        />
                   </FormLayout>
               </BlockStack>
            </Card>
        </Form>
    </Page>
  );
} 