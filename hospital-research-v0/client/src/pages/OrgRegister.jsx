import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { Input, Textarea } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import authStyles from '../styles/AuthPage.module.css';

const OrgRegister = () => {
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [formState, setFormState] = useState({
    name: '',
    country: '',
    contactEmail: '',
    message: '',
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/org/register', formState);
      return response.data;
    },
    onSuccess: () => {
      setStatusMessage('Thank you. Our platform team will contact you within 2 business days.');
      setError('');
      setFormState({
        name: '',
        country: '',
        contactEmail: '',
        message: '',
      });
    },
    onError: (err) => {
      const message = err.response?.data?.error || 'Unable to send request right now.';
      setError(message);
      setStatusMessage('');
    },
  });

  const onSubmit = (event) => {
    event.preventDefault();
    setStatusMessage('');
    setError('');
    registerMutation.mutate();
  };

  return (
    <div className={authStyles.page}>
      <div className={authStyles.card}>
        <div className={authStyles.header}>
          <h1 className={authStyles.title}>Request organisation onboarding</h1>
          <p className={authStyles.subtitle}>
            Share basic details so we can provision a sandbox environment for your research team.
          </p>
        </div>
        <form className={authStyles.form} onSubmit={onSubmit}>
          <div className={authStyles.field}>
            <label htmlFor="name">Organisation name</label>
            <Input
              id="name"
              value={formState.name}
              onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Pioneer Health Research Unit"
              required
            />
          </div>

          <div className={authStyles.field}>
            <label htmlFor="country">Country</label>
            <Input
              id="country"
              value={formState.country}
              onChange={(event) => setFormState((prev) => ({ ...prev, country: event.target.value }))}
              placeholder="Country where your organisation operates"
              required
            />
          </div>

          <div className={authStyles.field}>
            <label htmlFor="contactEmail">Primary contact email</label>
            <Input
              id="contactEmail"
              type="email"
              value={formState.contactEmail}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, contactEmail: event.target.value }))
              }
              placeholder="team@organisation.org"
              required
            />
          </div>

          <div className={authStyles.field}>
            <label htmlFor="message">Tell us about your research goals</label>
            <Textarea
              id="message"
              rows={4}
              value={formState.message}
              onChange={(event) => setFormState((prev) => ({ ...prev, message: event.target.value }))}
              placeholder="Share current projects, team size, and any specific onboarding needs."
            />
          </div>

          {statusMessage ? <div className={authStyles.footnote}>{statusMessage}</div> : null}
          {error ? <div className={authStyles.error}>{error}</div> : null}

          <Button type="submit" disabled={registerMutation.isLoading}>
            {registerMutation.isLoading ? 'Submitting…' : 'Submit request'}
          </Button>
        </form>
        <p className={authStyles.footnote}>
          Already have an account?{' '}
          <Link to="/login" className={authStyles.link}>
            Return to sign in
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default OrgRegister;
